import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import { env } from '../config/env.js'

const ALGO = 'aes-256-cbc'
const key = scryptSync(env.ENCRYPT_KEY, 'salt', 32)

export function encrypt(text: string): string {
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return iv.toString('hex') + ':' + encrypted.toString('hex')
}

export function decrypt(stored: string): string {
  const [ivHex, encHex] = stored.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const decipher = createDecipheriv(ALGO, key, iv)
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()])
  return decrypted.toString('utf8')
}
