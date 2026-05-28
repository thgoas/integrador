import type { FastifyInstance } from 'fastify'
import { getDb } from '../../db/sqlite.js'
import { encrypt, decrypt } from '../../db/crypto.js'

export async function apiConnectionRoutes(app: FastifyInstance) {
  const db = getDb()

  app.get('/api-connections', async () => {
    return db.prepare('SELECT id, name, base_url, auth_type, auth_header, headers, created_at FROM api_connections ORDER BY id DESC').all()
  })

  app.post<{ Body: { name: string; base_url: string; auth_type?: string; auth_header?: string; auth_value?: string; headers?: string } }>(
    '/api-connections',
    async (req, reply) => {
      const { name, base_url, auth_type = 'none', auth_header, auth_value, headers } = req.body
      const encValue = auth_value ? encrypt(auth_value) : null
      const result = db.prepare(
        'INSERT INTO api_connections (name, base_url, auth_type, auth_header, auth_value, headers) VALUES (?,?,?,?,?,?)'
      ).run(name, base_url, auth_type, auth_header ?? null, encValue, headers ?? null)
      reply.code(201)
      return { id: result.lastInsertRowid }
    }
  )

  app.put<{ Params: { id: string }; Body: { name?: string; base_url?: string; auth_type?: string; auth_header?: string; auth_value?: string; headers?: string } }>(
    '/api-connections/:id',
    async (req, reply) => {
      const existing = db.prepare('SELECT * FROM api_connections WHERE id = ?').get(req.params.id) as any
      if (!existing) return reply.code(404).send({ error: 'Not found' })
      const { name, base_url, auth_type, auth_header, auth_value, headers } = req.body
      const encValue = auth_value ? encrypt(auth_value) : existing.auth_value
      db.prepare(
        'UPDATE api_connections SET name=?, base_url=?, auth_type=?, auth_header=?, auth_value=?, headers=? WHERE id=?'
      ).run(
        name ?? existing.name,
        base_url ?? existing.base_url,
        auth_type ?? existing.auth_type,
        auth_header !== undefined ? (auth_header || null) : existing.auth_header,
        encValue,
        headers !== undefined ? (headers || null) : existing.headers,
        req.params.id
      )
      return { ok: true }
    }
  )

  app.delete<{ Params: { id: string } }>('/api-connections/:id', async (req, reply) => {
    const result = db.prepare('DELETE FROM api_connections WHERE id = ?').run(req.params.id)
    if (result.changes === 0) return reply.code(404).send({ error: 'Not found' })
    return { ok: true }
  })

  app.post<{ Params: { id: string } }>('/api-connections/:id/test', async (req, reply) => {
    const conn = db.prepare('SELECT * FROM api_connections WHERE id = ?').get(req.params.id) as any
    if (!conn) return reply.code(404).send({ error: 'Not found' })

    const headers: Record<string, string> = { Accept: 'application/json' }
    if (conn.headers) {
      try { Object.assign(headers, JSON.parse(conn.headers)) } catch {}
    }
    const authValue = conn.auth_value ? decrypt(conn.auth_value) : ''
    if (conn.auth_type === 'bearer') {
      headers['Authorization'] = `Bearer ${authValue}`
    } else if (conn.auth_type === 'apikey') {
      headers[conn.auth_header ?? 'X-API-Key'] = authValue
    } else if (conn.auth_type === 'basic') {
      headers['Authorization'] = `Basic ${Buffer.from(authValue).toString('base64')}`
    }

    try {
      const res = await fetch(conn.base_url, {
        method: 'HEAD',
        headers,
        signal: AbortSignal.timeout(5000),
      })
      return { ok: true, message: `Alcançável — status HTTP ${res.status}` }
    } catch (err: any) {
      return reply.code(400).send({ ok: false, error: err.message })
    }
  })
}
