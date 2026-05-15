import type { FastifyInstance } from 'fastify'
import { findUser, verifyPassword } from '../../db/users.js'

export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: { username: string; password: string } }>(
    '/auth/login',
    { config: { public: true } },
    async (req, reply) => {
      const { username, password } = req.body ?? {}
      const user = findUser(username)
      if (!user || !verifyPassword(password, user.password)) {
        return reply.code(401).send({ error: 'Usuário ou senha incorretos' })
      }
      const token = app.jwt.sign({ username: user.username, id: user.id }, { expiresIn: '12h' })
      return { token, username: user.username }
    }
  )

  app.get('/auth/me', async (req) => {
    const { username, id } = req.user as any
    return { id, username }
  })
}
