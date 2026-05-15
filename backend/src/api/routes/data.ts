import type { FastifyInstance } from 'fastify'
import { destPool } from '../../config/destination.js'

export async function dataRoutes(app: FastifyInstance) {
  app.post<{ Params: { table: string }; Body: Record<string, any> | Record<string, any>[] }>(
    '/data/:table',
    async (req, reply) => {
      const rows = Array.isArray(req.body) ? req.body : [req.body]
      if (rows.length === 0) return reply.code(400).send({ error: 'No rows provided' })

      const columns = Object.keys(rows[0])
      const placeholders = rows.map((_, i) =>
        `(${columns.map((_, j) => `$${i * columns.length + j + 1}`).join(',')})`
      ).join(',')
      const values = rows.flatMap(r => columns.map(c => r[c]))
      const table = req.params.table.replace(/[^a-zA-Z0-9_]/g, '')

      const query = `INSERT INTO ${table} (${columns.join(',')}) VALUES ${placeholders}`
      await destPool.query(query, values)

      return { ok: true, inserted: rows.length }
    }
  )
}
