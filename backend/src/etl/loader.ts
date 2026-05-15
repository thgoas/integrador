import { from as copyFrom } from 'pg-copy-streams'
import { destPool } from '../config/destination.js'

function formatCsvValue(val: any): string {
  if (val === null || val === undefined) return '\\N'
  const str = val instanceof Date ? val.toISOString() : String(val)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

function inferType(val: any): string {
  if (val === null || val === undefined) return 'TEXT'
  if (typeof val === 'number') return Number.isInteger(val) ? 'BIGINT' : 'NUMERIC'
  if (typeof val === 'boolean') return 'BOOLEAN'
  if (val instanceof Date) return 'TIMESTAMPTZ'
  const str = String(val)
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return 'DATE'
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(str)) return 'TIMESTAMPTZ'
  if (/^-?\d+(\.\d+)?$/.test(str) && str.length < 20) return 'NUMERIC'
  return 'TEXT'
}

async function getColumnTypes(client: any, tableName: string): Promise<Map<string, string>> {
  const res = await client.query<{ column_name: string; data_type: string }>(
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
      const n = Number(val)
      out[col] = isNaN(n) ? null : val
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
  codeColumn?: string | null
): Promise<void> {
  const typedColDefs = columns.map(c => `"${c}" ${inferType(sampleRow[c])}`).join(', ')
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
  sampleRow: Record<string, any>
): Promise<void> {
  const existing = await destPool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
    [destinationTable]
  )
  const existingCols = new Set(existing.rows.map(r => r.column_name))
  for (const col of columns) {
    if (!existingCols.has(col)) {
      await destPool.query(
        `ALTER TABLE "${destinationTable}" ADD COLUMN IF NOT EXISTS "${col}" ${inferType(sampleRow[col])}`
      )
    }
  }
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
