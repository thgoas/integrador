import type { FastifyInstance } from 'fastify'
import { getDb } from '../../db/sqlite.js'
import { encrypt, decrypt } from '../../db/crypto.js'
import sql from 'mssql'
import mysql from 'mysql2/promise'
import pg from 'pg'

export async function connectionRoutes(app: FastifyInstance) {
  const db = getDb()

  app.get('/connections', async () => {
    const rows = db.prepare('SELECT id, name, type, host, port, database, username, created_at FROM connections ORDER BY id DESC').all()
    return rows
  })

  app.post<{ Body: { name: string; type: string; host: string; port?: number; database: string; username?: string; password?: string } }>(
    '/connections',
    async (req, reply) => {
      const { name, type, host, port, database, username, password } = req.body
      const encPw = password ? encrypt(password) : null
      const result = db.prepare(
        'INSERT INTO connections (name, type, host, port, database, username, password) VALUES (?,?,?,?,?,?,?)'
      ).run(name, type, host ?? null, port ?? null, database, username ?? null, encPw)
      reply.code(201)
      return { id: result.lastInsertRowid }
    }
  )

  app.put<{ Params: { id: string }; Body: { name?: string; host?: string; port?: number; database?: string; username?: string; password?: string } }>(
    '/connections/:id',
    async (req, reply) => {
      const { name, host, port, database, username, password } = req.body
      const existing = db.prepare('SELECT * FROM connections WHERE id = ?').get(req.params.id) as any
      if (!existing) return reply.code(404).send({ error: 'Not found' })
      const encPw = password ? encrypt(password) : existing.password
      db.prepare(
        'UPDATE connections SET name=?, host=?, port=?, database=?, username=?, password=? WHERE id=?'
      ).run(name ?? existing.name, host ?? existing.host, port ?? existing.port, database ?? existing.database, username ?? existing.username, encPw, req.params.id)
      return { ok: true }
    }
  )

  app.delete<{ Params: { id: string } }>('/connections/:id', async (req, reply) => {
    const result = db.prepare('DELETE FROM connections WHERE id = ?').run(req.params.id)
    if (result.changes === 0) return reply.code(404).send({ error: 'Not found' })
    return { ok: true }
  })

  app.post<{ Params: { id: string } }>('/connections/:id/test', async (req, reply) => {
    const conn = db.prepare('SELECT * FROM connections WHERE id = ?').get(req.params.id) as any
    if (!conn) return reply.code(404).send({ error: 'Not found' })
    const password = conn.password ? decrypt(conn.password) : ''
    try {
      if (conn.type === 'mssql') {
        const pool = await sql.connect({ server: conn.host, port: conn.port ?? 1433, database: conn.database, user: conn.username, password, options: { trustServerCertificate: true }, connectionTimeout: 5000 })
        await pool.request().query('SELECT 1')
        await pool.close()
      } else if (conn.type === 'mysql') {
        const connection = await mysql.createConnection({ host: conn.host, port: conn.port ?? 3306, database: conn.database, user: conn.username, password, connectTimeout: 5000 })
        await connection.ping()
        await connection.end()
      } else {
        const client = new pg.Client({ host: conn.host, port: conn.port ?? 5432, database: conn.database, user: conn.username, password, connectionTimeoutMillis: 5000 })
        await client.connect()
        await client.query('SELECT 1')
        await client.end()
      }
      return { ok: true, message: 'Conexão bem-sucedida' }
    } catch (err: any) {
      return reply.code(400).send({ ok: false, error: err.message })
    }
  })
}
