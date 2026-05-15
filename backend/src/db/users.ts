import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto'
import { getDb } from './sqlite.js'

interface User {
  id: number
  username: string
  password: string
  created_at: string
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const derived = pbkdf2Sync(password, salt, 100_000, 64, 'sha512')
  return timingSafeEqual(Buffer.from(hash, 'hex'), derived)
}

export function findUser(username: string): User | undefined {
  return getDb().prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined
}

export function updatePassword(username: string, newPassword: string) {
  getDb().prepare('UPDATE users SET password = ? WHERE username = ?').run(hashPassword(newPassword), username)
}

export function seedAdminIfEmpty(username: string, password: string) {
  const db = getDb()
  const { count } = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }
  if (count === 0) {
    db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, hashPassword(password))
    console.log(`[users] Admin "${username}" criado`)
  }
}
