import { randomBytes, createHash } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { getDb } from '../../db/sqlite.js'

export async function tokenRoutes(app: FastifyInstance) {
  app.post<{ Body: { name: string } }>('/auth/tokens', async (req, reply) => {
    const user = req.user as { id: number }
    const name = (req.body?.name ?? '').trim()
    if (!name) return reply.code(400).send({ error: 'name is required' })

    const raw = 'itg_' + randomBytes(32).toString('hex')
    const hash = createHash('sha256').update(raw).digest('hex')

    const db = getDb()
    const result = db.prepare(
      'INSERT INTO api_tokens (user_id, name, token_hash) VALUES (?, ?, ?)'
    ).run(user.id, name, hash)

    return { id: result.lastInsertRowid, name, token: raw }
  })

  app.get('/auth/tokens', async (req) => {
    const user = req.user as { id: number }
    const db = getDb()
    const rows = db.prepare(
      'SELECT id, name, last_used_at, created_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC'
    ).all(user.id)
    return rows
  })

  app.delete<{ Params: { id: string } }>('/auth/tokens/:id', async (req, reply) => {
    const user = req.user as { id: number }
    const db = getDb()
    const result = db.prepare(
      'DELETE FROM api_tokens WHERE id = ? AND user_id = ?'
    ).run(Number(req.params.id), user.id)

    if (result.changes === 0) return reply.code(404).send({ error: 'Token not found' })
    return { ok: true }
  })
}
