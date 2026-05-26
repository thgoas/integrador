import { createHash } from 'node:crypto'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import { env } from '../config/env.js'
import { getDb } from '../db/sqlite.js'
import { authRoutes } from './routes/auth.js'
import { connectionRoutes } from './routes/connections.js'
import { jobRoutes } from './routes/jobs.js'
import { runRoutes } from './routes/runs.js'
import { dataRoutes } from './routes/data.js'
import { apiConnectionRoutes } from './routes/api-connections.js'
import { tokenRoutes } from './routes/tokens.js'

export async function buildServer() {
  const app = Fastify({ logger: { transport: { target: 'pino-pretty' } } })

  await app.register(cors, { origin: true })
  await app.register(jwt, { secret: env.JWT_SECRET })

  // Accept empty JSON bodies — fixes DELETE/POST requests without body
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (!body || (body as string).trim() === '') {
      done(null, {})
      return
    }
    try {
      done(null, JSON.parse(body as string))
    } catch (err) {
      done(err as Error, undefined)
    }
  })

  // Auth guard: all routes require valid JWT unless route is marked public
  app.addHook('onRequest', async (req, reply) => {
    const isPublic = (req.routeOptions?.config as any)?.public === true
    if (isPublic || req.url.startsWith('/api/health')) return

    const auth = req.headers.authorization ?? ''
    if (auth.startsWith('Bearer itg_')) {
      const raw = auth.slice(7)
      const hash = createHash('sha256').update(raw).digest('hex')
      const row = getDb().prepare('SELECT id FROM api_tokens WHERE token_hash = ?').get(hash) as { id: number } | undefined
      if (!row) return void reply.code(401).send({ error: 'Token inválido' })

      const path = req.url.split('?')[0]
      if (req.method !== 'GET' || !path.startsWith('/api/data')) {
        return void reply.code(403).send({ error: 'API token permite apenas GET /api/data/*' })
      }

      getDb().prepare('UPDATE api_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?').run(row.id)
      return
    }

    try {
      await req.jwtVerify()
    } catch {
      reply.code(401).send({ error: 'Não autenticado' })
    }
  })

  app.register(authRoutes, { prefix: '/api' })
  app.register(connectionRoutes, { prefix: '/api' })
  app.register(jobRoutes, { prefix: '/api' })
  app.register(runRoutes, { prefix: '/api' })
  app.register(dataRoutes, { prefix: '/api' })
  app.register(apiConnectionRoutes, { prefix: '/api' })
  app.register(tokenRoutes, { prefix: '/api' })

  app.get('/api/health', async () => ({ status: 'ok' }))

  return app
}
