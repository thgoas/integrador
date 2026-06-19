/**
 * Cria índices no PostgreSQL de DESTINO para acelerar as consultas agregadas
 * por (data, loja/empresa) usadas no backfill do Painel Grupo Abys.
 *
 * Idempotente: usa CREATE INDEX CONCURRENTLY IF NOT EXISTS e pula tabelas ou
 * colunas que ainda não existem (as tabelas de destino são auto-criadas pelo ETL).
 *
 * Uso:
 *   npm run build && npm run indexes
 *   (equivalente a: node --env-file=.env dist/scripts/create-indexes.js)
 *
 * CONCURRENTLY não pode rodar dentro de transação — cada statement é enviado
 * isoladamente pelo pool (autocommit), então está OK.
 */
import { destPool } from '../config/destination.js'

interface IndexSpec {
  table: string
  /** Coluna de data — obrigatória; se não existir, o índice é pulado. */
  dateColumn: string
  /** Colunas extras do índice composto; só as existentes são incluídas. */
  extraColumns: string[]
}

const SPECS: IndexSpec[] = [
  { table: 'vendas', dateColumn: 'dtvenda', extraColumns: ['empresa', 'loja'] },
  { table: 'estoques', dateColumn: 'data', extraColumns: ['loja'] },
  { table: 'cadastros', dateColumn: 'data_venda', extraColumns: ['empresa', 'loja'] },
]

async function tableExists(table: string): Promise<boolean> {
  const r = await destPool.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  )
  return r.rowCount! > 0
}

async function existingColumns(table: string, columns: string[]): Promise<Set<string>> {
  const r = await destPool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = ANY($2)`,
    [table, columns]
  )
  return new Set(r.rows.map(row => row.column_name))
}

async function main() {
  for (const spec of SPECS) {
    if (!(await tableExists(spec.table))) {
      console.log(`⏭  Tabela "${spec.table}" não existe ainda — pulando`)
      continue
    }

    const wanted = [spec.dateColumn, ...spec.extraColumns]
    const present = await existingColumns(spec.table, wanted)

    if (!present.has(spec.dateColumn)) {
      console.log(`⏭  "${spec.table}".${spec.dateColumn} não existe — pulando (coluna de data ausente)`)
      continue
    }

    const cols = wanted.filter(c => present.has(c))
    const indexName = `idx_${spec.table}_${cols.join('_')}`
    const colList = cols.map(c => `"${c}"`).join(', ')
    const sql = `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${indexName}" ON "${spec.table}" (${colList})`

    process.stdout.write(`▶  ${indexName} ... `)
    try {
      await destPool.query(sql)
      console.log('ok')
    } catch (err: any) {
      console.log(`falhou: ${err.message}`)
    }

    try {
      await destPool.query(`ANALYZE "${spec.table}"`)
    } catch {
      /* best-effort */
    }
  }
}

main()
  .then(() => destPool.end())
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err)
    destPool.end().finally(() => process.exit(1))
  })
