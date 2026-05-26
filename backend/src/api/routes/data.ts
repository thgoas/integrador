import type { FastifyInstance } from 'fastify'
import { destPool } from '../../config/destination.js'
import { applyMapping } from '../../etl/transform.js'
import type { MappingConfig } from '../../etl/transform.js'

const RESERVED = new Set(['limit', 'offset', 'order_by', 'order_dir'])

const OPERATORS: Record<string, (col: string, idx: number) => string> = {
  gt:   (c, i) => `"${c}" > $${i}`,
  gte:  (c, i) => `"${c}" >= $${i}`,
  lt:   (c, i) => `"${c}" < $${i}`,
  lte:  (c, i) => `"${c}" <= $${i}`,
  like: (c, i) => `"${c}" ILIKE $${i}`,
  in:   (c, i) => `"${c}" = ANY($${i})`,
  null: (c)    => `"${c}" IS NULL`,
}

function parseFilters(query: Record<string, string>) {
  const conditions: string[] = []
  const values: unknown[] = []

  for (const [key, value] of Object.entries(query)) {
    if (RESERVED.has(key)) continue

    const parts = key.split('__')
    const rawCol = parts[0]
    const op = parts[1] ?? ''
    const col = rawCol.replace(/[^a-zA-Z0-9_]/g, '')
    if (!col) continue

    if (op === 'null') {
      const clause = value === 'false' ? `"${col}" IS NOT NULL` : `"${col}" IS NULL`
      conditions.push(clause)
    } else if (op && OPERATORS[op]) {
      const idx = values.length + 1
      const parsed = op === 'in' ? value.split(',') : value
      conditions.push(OPERATORS[op](col, idx))
      values.push(parsed)
    } else {
      const idx = values.length + 1
      conditions.push(`"${col}" = $${idx}`)
      values.push(value)
    }
  }

  return { conditions, values }
}

export async function dataRoutes(app: FastifyInstance) {
  // List all tables in destination PostgreSQL
  app.get('/data', async (_req, reply) => {
    try {
      const result = await destPool.query<{ table_name: string; row_estimate: number }>(`
        SELECT t.table_name,
               GREATEST(c.reltuples::bigint, 0) AS row_estimate
        FROM information_schema.tables t
        LEFT JOIN pg_class c ON c.relname = t.table_name
        WHERE t.table_schema = 'public'
          AND t.table_type = 'BASE TABLE'
        ORDER BY t.table_name
      `)
      return { tables: result.rows.map(r => ({ name: r.table_name, row_estimate: Number(r.row_estimate) })) }
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  // Inspect columns of a table
  app.get<{ Params: { table: string } }>('/data/:table/columns', async (req, reply) => {
    const table = req.params.table.replace(/[^a-zA-Z0-9_]/g, '')
    try {
      const result = await destPool.query<{
        column_name: string
        data_type: string
        ordinal_position: number
        is_nullable: string
      }>(`
        SELECT column_name, data_type, ordinal_position, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [table])

      if (result.rows.length === 0) return reply.code(404).send({ error: `Table "${table}" not found` })

      return {
        table,
        columns: result.rows.map(r => ({
          name: r.column_name,
          type: r.data_type,
          position: r.ordinal_position,
          nullable: r.is_nullable === 'YES',
        })),
      }
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  // Query table with pagination, ordering, and dynamic filters
  app.get<{
    Params: { table: string }
    Querystring: Record<string, string>
  }>('/data/:table', async (req, reply) => {
    const table = req.params.table.replace(/[^a-zA-Z0-9_]/g, '')
    const limit = Math.min(Math.max(1, Number(req.query.limit ?? 100)), 10000)
    const offset = Math.max(0, Number(req.query.offset ?? 0))
    const orderBy = (req.query.order_by ?? '').replace(/[^a-zA-Z0-9_]/g, '')
    const orderDir = req.query.order_dir === 'desc' ? 'DESC' : 'ASC'
    const orderClause = orderBy ? ` ORDER BY "${orderBy}" ${orderDir}` : ''

    const { conditions, values } = parseFilters(req.query)
    const whereClause = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''
    const filterValues = values

    try {
      const dataIdx = filterValues.length + 1
      const offsetIdx = filterValues.length + 2

      const [rows, count] = await Promise.all([
        destPool.query(
          `SELECT * FROM "${table}"${whereClause}${orderClause} LIMIT $${dataIdx} OFFSET $${offsetIdx}`,
          [...filterValues, limit, offset]
        ),
        destPool.query(
          `SELECT COUNT(*) AS total FROM "${table}"${whereClause}`,
          filterValues
        ),
      ])
      return { data: rows.rows, total: Number(count.rows[0].total), limit, offset }
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  app.post<{
    Params: { table: string }
    Body: Record<string, any> | Record<string, any>[] | { rows: Record<string, any>[]; mapping?: MappingConfig }
  }>(
    '/data/:table',
    async (req, reply) => {
      const body = req.body as any
      let rows: Record<string, any>[]
      let mapping: MappingConfig | undefined

      if (Array.isArray(body)) {
        rows = body
      } else if (body?.rows !== undefined) {
        rows = Array.isArray(body.rows) ? body.rows : [body.rows]
        mapping = body.mapping
      } else {
        rows = [body]
      }

      if (rows.length === 0) return reply.code(400).send({ error: 'No rows provided' })

      if (mapping) {
        try {
          rows = applyMapping(rows, mapping)
        } catch (err: any) {
          return reply.code(400).send({ error: `Mapping error: ${err.message}` })
        }
      }

      const table = req.params.table.replace(/[^a-zA-Z0-9_]/g, '')
      const columns = Object.keys(rows[0])
      const placeholders = rows.map((_, i) =>
        `(${columns.map((_, j) => `$${i * columns.length + j + 1}`).join(',')})`
      ).join(',')
      const values = rows.flatMap(r => columns.map(c => r[c]))

      const query = `INSERT INTO "${table}" (${columns.map(c => `"${c}"`).join(',')}) VALUES ${placeholders}`
      await destPool.query(query, values)

      return { ok: true, inserted: rows.length }
    }
  )
}
