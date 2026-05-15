import type { FastifyInstance } from 'fastify'
import { getDb } from '../../db/sqlite.js'
import { sseClients } from '../sse.js'

export async function runRoutes(app: FastifyInstance) {
  const db = getDb()

  app.get<{ Params: { id: string } }>('/jobs/:id/runs', async (req, reply) => {
    const runs = db.prepare(`
      SELECT * FROM runs WHERE job_id = ? ORDER BY id DESC LIMIT 50
    `).all(req.params.id)
    return runs
  })

  app.get<{ Params: { id: string } }>('/runs/:id', async (req, reply) => {
    const run = db.prepare('SELECT * FROM runs WHERE id = ?').get(req.params.id)
    if (!run) return reply.code(404).send({ error: 'Not found' })
    return run
  })

  // Polling endpoint: returns logs since a given log id
  // Frontend polls this every 2s while run is active
  app.get<{ Params: { id: string }; Querystring: { after?: string } }>(
    '/runs/:id/logs',
    async (req, reply) => {
      const runId = Number(req.params.id)
      const after = Number(req.query.after ?? 0)

      const logs = db.prepare(
        'SELECT * FROM run_logs WHERE run_id = ? AND id > ? ORDER BY id ASC LIMIT 200'
      ).all(runId, after)

      const run = db.prepare('SELECT status, rows_read, rows_written FROM runs WHERE id = ?').get(runId) as any

      return {
        logs,
        status: run?.status ?? 'unknown',
        rows_read: run?.rows_read ?? 0,
        rows_written: run?.rows_written ?? 0,
      }
    }
  )
}
