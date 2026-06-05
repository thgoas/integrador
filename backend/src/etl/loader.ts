import { from as copyFrom } from 'pg-copy-streams'
import { destPool } from '../config/destination.js'

function formatCsvValue(val: any): string {
  if (val === null || val === undefined) return '\\N'
  const str = val instanceof Date
    ? val.toISOString().slice(0, 10)  // YYYY-MM-DD — sem componente de hora
    : String(val)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

/** Whitelist de tipos "amigáveis" → SQL. Valor fora da lista é ignorado (cai na inferência). */
const PG_TYPE_MAP: Record<string, string> = {
  text: 'TEXT',
  string: 'TEXT',
  bigint: 'BIGINT',
  integer: 'BIGINT',
  int: 'BIGINT',
  numeric: 'NUMERIC',
  number: 'NUMERIC',
  decimal: 'NUMERIC',
  float: 'DOUBLE PRECISION',
  boolean: 'BOOLEAN',
  bool: 'BOOLEAN',
  date: 'DATE',
  timestamp: 'TIMESTAMPTZ',
  timestamptz: 'TIMESTAMPTZ',
}

/** Resolve o tipo SQL de uma coluna: usa o override (se reconhecido) ou infere do valor. */
function resolveColumnSqlType(col: string, sampleVal: any, typeOverrides?: Record<string, string>): string {
  const override = typeOverrides?.[col]
  if (override) {
    const sql = PG_TYPE_MAP[override.toLowerCase()]
    if (sql) return sql
  }
  return inferType(sampleVal)
}

function inferType(val: any): string {
  if (val === null || val === undefined) return 'TEXT'
  if (typeof val === 'number') return Number.isInteger(val) ? 'BIGINT' : 'NUMERIC'
  if (typeof val === 'boolean') return 'BOOLEAN'
  if (val instanceof Date) return 'DATE'
  const str = String(val)
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return 'DATE'
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(str)) return 'DATE'
  if (/^-?\d+(\.\d+)?$/.test(str) && str.length < 20) return 'NUMERIC'
  return 'TEXT'
}

async function getColumnTypes(client: any, tableName: string): Promise<Map<string, string>> {
  const res = await client.query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1`,
    [tableName]
  )
  return new Map(res.rows.map((r: any) => [r.column_name, r.data_type]))
}

function sanitizeRow(row: Record<string, any>, colTypes: Map<string, string>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const [col, val] of Object.entries(row)) {
    const type = colTypes.get(col) ?? ''
    if (val !== null && val !== undefined && /^(numeric|bigint|integer|smallint|real|double|decimal)/i.test(type)) {
      const trimmed = typeof val === 'string' ? val.trim() : val
      const n = Number(trimmed)
      out[col] = (trimmed === '' || isNaN(n)) ? null : val
    } else {
      out[col] = val
    }
  }
  return out
}

export async function ensureTable(
  destinationTable: string,
  columns: string[],
  sampleRow: Record<string, any>,
  codeColumn?: string | null,
  typeOverrides?: Record<string, string>
): Promise<void> {
  const typedColDefs = columns.map(c => `"${c}" ${resolveColumnSqlType(c, sampleRow[c], typeOverrides)}`).join(', ')
  await destPool.query(`CREATE TABLE IF NOT EXISTS "${destinationTable}" (${typedColDefs})`)

  if (codeColumn) {
    const idxName = `uq_${destinationTable}_${codeColumn}`.replace(/[^a-z0-9_]/gi, '_')
    await destPool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "${idxName}" ON "${destinationTable}" ("${codeColumn}")`
    )
  }
}

export async function syncColumns(
  destinationTable: string,
  columns: string[],
  sampleRow: Record<string, any>,
  typeOverrides?: Record<string, string>
): Promise<void> {
  const existing = await destPool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
    [destinationTable]
  )
  const existingCols = new Set(existing.rows.map(r => r.column_name))
  for (const col of columns) {
    if (!existingCols.has(col)) {
      await destPool.query(
        `ALTER TABLE "${destinationTable}" ADD COLUMN IF NOT EXISTS "${col}" ${resolveColumnSqlType(col, sampleRow[col], typeOverrides)}`
      )
    }
  }
}

/** Mapeia data_type do information_schema para o "grupo" SQL comparável. */
function normalizeExistingType(dataType: string): string {
  const t = dataType.toLowerCase()
  if (t === 'text' || t === 'character varying' || t === 'character' || t === 'varchar') return 'TEXT'
  if (t === 'bigint' || t === 'integer' || t === 'smallint') return 'BIGINT'
  if (t === 'numeric' || t === 'decimal') return 'NUMERIC'
  if (t === 'double precision' || t === 'real') return 'DOUBLE PRECISION'
  if (t === 'boolean') return 'BOOLEAN'
  if (t === 'date') return 'DATE'
  if (t.startsWith('timestamp')) return 'TIMESTAMPTZ'
  return dataType.toUpperCase()
}

export interface AlterTypeResult {
  changed: { column: string; from: string; to: string }[]
  failed: { column: string; to: string; error: string }[]
}

/**
 * Altera o tipo de colunas JÁ existentes para casar com os overrides do usuário.
 * Best-effort: cada coluna em try/catch; NUMERIC→TEXT é seguro, TEXT→NUMERIC pode falhar.
 */
export async function alterColumnTypes(
  destinationTable: string,
  typeOverrides: Record<string, string>
): Promise<AlterTypeResult> {
  const result: AlterTypeResult = { changed: [], failed: [] }
  const entries = Object.entries(typeOverrides)
  if (entries.length === 0) return result

  const existing = await destPool.query<{ column_name: string; data_type: string }>(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1`,
    [destinationTable]
  )
  const existingTypes = new Map(existing.rows.map(r => [r.column_name, r.data_type]))

  for (const [col, friendly] of entries) {
    const targetSql = PG_TYPE_MAP[friendly.toLowerCase()]
    if (!targetSql) continue
    const current = existingTypes.get(col)
    if (current === undefined) continue // coluna ainda não existe; será criada com o tipo certo
    if (normalizeExistingType(current) === targetSql) continue // já está no tipo desejado
    try {
      await destPool.query(
        `ALTER TABLE "${destinationTable}" ALTER COLUMN "${col}" TYPE ${targetSql} USING "${col}"::${targetSql}`
      )
      result.changed.push({ column: col, from: current, to: targetSql })
    } catch (err: any) {
      result.failed.push({ column: col, to: targetSql, error: err.message })
    }
  }
  return result
}

export async function deletePeriod(
  destinationTable: string,
  dateColumn: string,
  dateFrom: string,
  dateTo: string
): Promise<number> {
  const result = await destPool.query(
    `DELETE FROM "${destinationTable}" WHERE "${dateColumn}"::date BETWEEN $1::date AND $2::date`,
    [dateFrom, dateTo]
  )
  return result.rowCount ?? 0
}

async function copyToTable(
  client: any,
  targetTable: string,
  columns: string[],
  rows: Record<string, any>[],
  colTypes?: Map<string, string>
): Promise<void> {
  const colList = columns.map(c => `"${c}"`).join(', ')
  await new Promise<void>((resolve, reject) => {
    const stream = client.query(
      copyFrom(`COPY "${targetTable}" (${colList}) FROM STDIN WITH (FORMAT CSV, NULL '\\N')`)
    )
    stream.on('error', reject)
    stream.on('finish', resolve)
    const writeAll = async () => {
      for (const row of rows) {
        const finalRow = colTypes ? sanitizeRow(row, colTypes) : row
        const line = columns.map(col => formatCsvValue(finalRow[col])).join(',') + '\n'
        if (!stream.write(line)) await new Promise<void>(r => stream.once('drain', r))
      }
      stream.end()
    }
    writeAll().catch(reject)
  })
}

export async function copyChunkToTable(
  destinationTable: string,
  columns: string[],
  rows: Record<string, any>[]
): Promise<void> {
  const client = await destPool.connect()
  try {
    const colTypes = await getColumnTypes(client, destinationTable)
    await copyToTable(client, destinationTable, columns, rows, colTypes)
  } finally {
    client.release()
  }
}

export async function upsertChunkToTable(
  destinationTable: string,
  codeColumn: string,
  columns: string[],
  rows: Record<string, any>[]
): Promise<void> {
  const stagingTable = `_stg_${destinationTable}`.replace(/[^a-z0-9_]/gi, '_')
  const colList = columns.map(c => `"${c}"`).join(', ')
  const setClauses = columns
    .filter(c => c !== codeColumn)
    .map(c => `"${c}" = EXCLUDED."${c}"`)
    .join(', ')

  const client = await destPool.connect()
  try {
    await client.query('BEGIN')
    const colTypes = await getColumnTypes(client, destinationTable)
    await client.query(`CREATE TEMP TABLE "${stagingTable}" (LIKE "${destinationTable}") ON COMMIT DROP`)
    await copyToTable(client, stagingTable, columns, rows, colTypes)
    await client.query(`
      INSERT INTO "${destinationTable}" (${colList})
      SELECT ${colList} FROM "${stagingTable}"
      ON CONFLICT ("${codeColumn}") DO UPDATE SET ${setClauses}
    `)
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
