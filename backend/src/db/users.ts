import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto'
import { getDb } from './sqlite.js'

interface User {
  id: number
  username: string
  password: string
  created_at: string
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const derived = scryptSync(password, salt, 64)
  return `${salt}:${derived.toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const hashBuf = Buffer.from(hash, 'hex')
  const derived = scryptSync(password, salt, 64)
  return timingSafeEqual(hashBuf, derived)
}

export function findUser(username: string): User | undefined {
  return getDb().prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined
}

export function seedAdminIfEmpty(username: string, password: string) {
  const db = getDb()
  const { count } = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }
  if (count === 0) {
    db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, hashPassword(password))
    console.log(`[users] Admin "${username}" criado a partir do .env`)
  }
}
