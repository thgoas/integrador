import type { FastifyInstance } from 'fastify'
import { findUser, verifyPassword, updatePassword } from '../../db/users.js'

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

  app.put<{ Body: { current_password: string; new_password: string } }>(
    '/auth/password',
    async (req, reply) => {
      const { username } = req.user as any
      const { current_password, new_password } = req.body ?? {}
      if (!new_password || new_password.length < 6) {
        return reply.code(400).send({ error: 'Nova senha deve ter pelo menos 6 caracteres' })
      }
      const user = findUser(username)
      if (!user || !verifyPassword(current_password, user.password)) {
        return reply.code(401).send({ error: 'Senha atual incorreta' })
      }
      updatePassword(username, new_password)
      return { ok: true }
    }
  )
}
