/**
 * Recalcula o custo médio (média móvel ponderada) por (empresa, produto) a partir das
 * movimentações de `estoques` e materializa em `custo_medio_produto` no PostgreSQL de
 * DESTINO. Alimenta o endpoint GET /api/estoque/custo-medio. Ver SPEC-CUSTO-MEDIO-PRODUTO.md.
 *
 * Como: faz UM scan de `estoques` ordenado por (empresa, produto, data) via cursor
 * (pg-query-stream) e dobra cada produto em ordem cronológica (CustoMedioAccumulator).
 * Só a COMPRA (coluna `compra` boolean) altera o custo; venda/transferência mexe só na
 * quantidade — imune ao custo placeholder R$ 1 das saídas.
 *
 * Coluna de custo da linha: auto-detectada em `estoques` (custo_total → custo_unitario →
 * custo). Total-vs-unitário inferido pelo nome (contém "total"). Override por env:
 *   CUSTO_MEDIO_COL=nome_da_coluna   CUSTO_MEDIO_COL_TOTAL=true|false
 * O script LOGA a coluna/modo escolhidos — confira na saída do run.
 *
 * Persistência: build + swap atômico (mesmo padrão de refresh-estoque-saldo) — grava em
 * custo_medio_produto_new e troca por RENAME; o endpoint nunca vê a tabela pela metade.
 *
 * Uso:  npm run build && npm run refresh-custo-medio
 * Idempotente. Agendar (cron/systemd) junto do refresh-saldo.
 */
import { destPool } from '../config/destination.js'
import { CustoMedioAccumulator } from '../etl/custo-medio.js'

async function tableExists(table: string): Promise<boolean> {
  const r = await destPool.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  )
  return r.rowCount! > 0
}

/** Descobre a coluna de custo da linha em estoques e se é total-da-linha ou unitário. */
async function resolveCustoColumn(): Promise<{ col: string; isTotal: boolean }> {
  const override = process.env.CUSTO_MEDIO_COL
  const candidates = override ? [override] : ['custo_total', 'custo_unitario', 'custo_unit', 'custo']
  const r = await destPool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'estoques' AND column_name = ANY($1)`,
    [candidates]
  )
  const present = new Set(r.rows.map(x => x.column_name))
  const col = candidates.find(c => present.has(c))
  if (!col) {
    throw new Error(
      `Nenhuma coluna de custo encontrada em estoques (tentei: ${candidates.join(', ')}). ` +
      `Defina CUSTO_MEDIO_COL com o nome correto.`
    )
  }
  const isTotal = process.env.CUSTO_MEDIO_COL_TOTAL
    ? process.env.CUSTO_MEDIO_COL_TOTAL === 'true'
    : /total/i.test(col)
  return { col, isTotal }
}

async function main() {
  if (!(await tableExists('estoques'))) {
    console.log('⏭  Tabela "estoques" não existe ainda — nada a fazer')
    return
  }

  const { col, isTotal } = await resolveCustoColumn()
  console.log(`▶  coluna de custo: "${col}" (${isTotal ? 'total da linha' : 'unitário × qtde'})`)

  // --- Fase 1: scan ordenado + fold em memória (resultados ~ nº de (empresa, produto)) ---
  const started = Date.now()
  const acc = new CustoMedioAccumulator()
  const { default: QueryStream } = await import('pg-query-stream')
  const reader = await destPool.connect()
  let lidos = 0
  try {
    const sql = `
      SELECT empresa, produto, qtde, compra, "${col}" AS custo_linha
      FROM estoques
      ORDER BY empresa, produto, data
    `
    const stream = reader.query(new QueryStream(sql, [], { batchSize: 10000 }))
    for await (const row of stream as AsyncIterable<any>) {
      lidos++
      const qtde = Number(row.qtde) || 0
      const compra = row.compra === true
      const custoLinha = Number(row.custo_linha) || 0
      const custoTotal = isTotal ? custoLinha : qtde * custoLinha
      acc.push(String(row.empresa), String(row.produto), qtde, compra, custoTotal)
    }
  } finally {
    reader.release()
  }
  const results = acc.finish()
  console.log(`▶  ${lidos} movimento(s) lidos → ${results.length} produto(s) com custo médio`)

  // --- Fase 2: grava em tabela nova + swap atômico ---
  const w = await destPool.connect()
  try {
    await w.query('BEGIN')
    await w.query('DROP TABLE IF EXISTS custo_medio_produto_new')
    await w.query(`
      CREATE TABLE custo_medio_produto_new (
        empresa       text    NOT NULL,
        produto       numeric NOT NULL,
        custo_medio   numeric,
        atualizado_em timestamptz NOT NULL DEFAULT now()
      )
    `)

    const BATCH = 1000
    for (let i = 0; i < results.length; i += BATCH) {
      const slice = results.slice(i, i + BATCH)
      const params: unknown[] = []
      const tuples = slice.map((r, j) => {
        params.push(r.empresa, r.produto, r.custo_medio)
        return `($${j * 3 + 1}, $${j * 3 + 2}, $${j * 3 + 3})`
      })
      await w.query(
        `INSERT INTO custo_medio_produto_new (empresa, produto, custo_medio) VALUES ${tuples.join(', ')}`,
        params
      )
    }

    await w.query('CREATE INDEX ON custo_medio_produto_new (empresa, produto)')
    await w.query('DROP TABLE IF EXISTS custo_medio_produto')
    await w.query('ALTER TABLE custo_medio_produto_new RENAME TO custo_medio_produto')
    await w.query('COMMIT')
  } catch (err) {
    await w.query('ROLLBACK')
    throw err
  } finally {
    w.release()
  }

  try {
    await destPool.query('ANALYZE custo_medio_produto')
  } catch {
    /* best-effort */
  }

  const secs = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`✓ custo_medio_produto recalculada: ${results.length} linhas em ${secs}s`)
}

main()
  .then(() => destPool.end())
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err)
    destPool.end().finally(() => process.exit(1))
  })
