/**
 * Recalcula o saldo de peças por (empresa, loja, produto) e materializa em
 * `estoque_saldo` no PostgreSQL de DESTINO. O endpoint GET /api/estoque/custo-atual
 * lê dessa tabela para responder em milissegundos, em vez de varrer os ~45,6M de
 * linhas de `estoques` a cada chamada (que levava ~26s/loja e dava 504 sem filtro).
 *
 * Estratégia: build numa tabela nova + swap por RENAME (full refresh):
 *   1. CREATE TABLE estoque_saldo_new AS SELECT ... (varre estoques; a tabela atual
 *      continua legível pelo endpoint, sem lock).
 *   2. DROP da antiga + RENAME da nova — único momento de lock (milissegundos, no commit).
 * Tudo numa transação, então o endpoint nunca vê a tabela pela metade nem trava durante
 * o cálculo.
 *
 * `produto` herda o tipo nativo de `estoques.produto` (numeric) — SEM cast para text —
 * para o JOIN com `produtos` continuar `numeric = numeric`. Recriar a tabela a cada run
 * também "cura" um eventual `estoque_saldo` antigo criado com o tipo errado.
 *
 * `HAVING SUM(qtde) > 0` por produto: descarta produtos com saldo zero/negativo (saldo
 * negativo de dados incompletos é tratado como ausência, não subtrai do total da loja).
 *
 * O saldo é o "atual" (soma de TODAS as movimentações). Consultas com `data` histórica
 * no endpoint não usam esta tabela — caem no scan direto de `estoques`.
 *
 * Uso:
 *   npm run build && npm run refresh-saldo
 *   (equivalente a: node --env-file=.env dist/scripts/refresh-estoque-saldo.js)
 *
 * Idempotente. Pode ser agendado (cron) no pipeline do integrador.
 */
import { destPool } from '../config/destination.js'

async function tableExists(table: string): Promise<boolean> {
  const r = await destPool.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  )
  return r.rowCount! > 0
}

async function main() {
  if (!(await tableExists('estoques'))) {
    console.log('⏭  Tabela "estoques" não existe ainda — nada a fazer')
    return
  }

  const started = Date.now()
  const client = await destPool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DROP TABLE IF EXISTS estoque_saldo_new')

    // produto SEM cast → mantém numeric (tipo de estoques.produto); now() = início da txn.
    const res = await client.query(`
      CREATE TABLE estoque_saldo_new AS
      SELECT empresa,
             loja,
             produto,
             SUM(qtde)  AS pecas,
             now()      AS atualizado_em
      FROM estoques
      GROUP BY empresa, loja, produto
      HAVING SUM(qtde) > 0
    `)

    // Índice p/ o filtro empresa/loja do endpoint.
    await client.query('CREATE INDEX ON estoque_saldo_new (empresa, loja)')

    // Swap atômico: a antiga só é trocada no commit (lock de milissegundos).
    await client.query('DROP TABLE IF EXISTS estoque_saldo')
    await client.query('ALTER TABLE estoque_saldo_new RENAME TO estoque_saldo')
    await client.query('COMMIT')

    const secs = ((Date.now() - started) / 1000).toFixed(1)
    console.log(`✓ estoque_saldo recalculada: ${res.rowCount} linhas (empresa,loja,produto) em ${secs}s`)
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  try {
    await destPool.query('ANALYZE estoque_saldo')
  } catch {
    /* best-effort */
  }
}

main()
  .then(() => destPool.end())
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err)
    destPool.end().finally(() => process.exit(1))
  })
