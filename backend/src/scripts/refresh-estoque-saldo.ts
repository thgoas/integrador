/**
 * Recalcula o saldo de peças por (empresa, loja, produto) e materializa em
 * `estoque_saldo` no PostgreSQL de DESTINO. O endpoint GET /api/estoque/custo-atual
 * lê dessa tabela para responder em milissegundos, em vez de varrer os ~45,6M de
 * linhas de `estoques` a cada chamada (que levava ~26s/loja e dava 504 sem filtro).
 *
 * Full refresh: TRUNCATE + INSERT … SELECT SUM(qtde) GROUP BY (empresa, loja, produto),
 * dentro de uma transação para o endpoint nunca ver a tabela pela metade.
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

const DDL = `
  CREATE TABLE IF NOT EXISTS estoque_saldo (
    empresa       text   NOT NULL,
    loja          text   NOT NULL,
    produto       text   NOT NULL,
    pecas         numeric,
    atualizado_em timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (empresa, loja, produto)
  )
`

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

  await destPool.query(DDL)

  const started = Date.now()
  const client = await destPool.connect()
  try {
    await client.query('BEGIN')
    await client.query('TRUNCATE estoque_saldo')
    const res = await client.query(`
      INSERT INTO estoque_saldo (empresa, loja, produto, pecas, atualizado_em)
      SELECT empresa, loja, produto, SUM(qtde), now()
      FROM estoques
      GROUP BY empresa, loja, produto
    `)
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
