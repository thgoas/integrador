import type { FastifyInstance } from 'fastify'
import { env } from '../../config/env.js'

export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: { username: string; password: string } }>(
    '/auth/login',
    { config: { public: true } },
    async (req, reply) => {
      const { username, password } = req.body ?? {}
      if (username !== env.APP_USER || password !== env.APP_PASSWORD) {
        return reply.code(401).send({ error: 'Usuário ou senha incorretos' })
      }
      const token = app.jwt.sign({ username }, { expiresIn: '12h' })
      return { token, username }
    }
  )

  app.get('/auth/me', async (req) => {
    return { username: (req.user as any).username }
  })
}
