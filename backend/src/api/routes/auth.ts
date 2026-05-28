import type { FastifyInstance } from 'fastify'
import { findUser, verifyPassword, updatePassword, createUser, listUsers, deleteUser } from '../../db/users.js'

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
      const token = app.jwt.sign({ username: user.username, id: user.id, is_admin: user.is_admin }, { expiresIn: '12h' })
      return { token, username: user.username, is_admin: user.is_admin }
    }
  )

  app.get('/auth/me', async (req) => {
    const { username, id, is_admin } = req.user as any
    return { id, username, is_admin }
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

  // User management — admin only
  app.get('/auth/users', async (req, reply) => {
    const { is_admin } = req.user as any
    if (!is_admin) return reply.code(403).send({ error: 'Acesso restrito a administradores' })
    return listUsers()
  })

  app.post<{ Body: { username: string; password: string; is_admin?: boolean } }>(
    '/auth/users',
    async (req, reply) => {
      const { is_admin } = req.user as any
      if (!is_admin) return reply.code(403).send({ error: 'Acesso restrito a administradores' })

      const { username, password, is_admin: newIsAdmin = false } = req.body ?? {}
      if (!username || !password) return reply.code(400).send({ error: 'username e password são obrigatórios' })
      if (password.length < 6) return reply.code(400).send({ error: 'Senha deve ter pelo menos 6 caracteres' })
      if (findUser(username)) return reply.code(409).send({ error: 'Usuário já existe' })

      const id = createUser(username, password, newIsAdmin)
      reply.code(201)
      return { id, username, is_admin: newIsAdmin ? 1 : 0 }
    }
  )

  app.delete<{ Params: { id: string } }>('/auth/users/:id', async (req, reply) => {
    const { is_admin, id: callerId } = req.user as any
    if (!is_admin) return reply.code(403).send({ error: 'Acesso restrito a administradores' })

    const targetId = Number(req.params.id)
    if (targetId === callerId) return reply.code(400).send({ error: 'Não é possível remover o próprio usuário' })

    const deleted = deleteUser(targetId)
    if (!deleted) return reply.code(404).send({ error: 'Usuário não encontrado' })
    return { ok: true }
  })
}
