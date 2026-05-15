// Uses Node.js built-in sqlite (available since Node 22.5)
import { DatabaseSync } from 'node:sqlite'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dirname, '../../integrador.db')

let _db: DatabaseSync | null = null

export function getDb(): DatabaseSync {
  if (!_db) {
    _db = new DatabaseSync(DB_PATH)
    _db.exec('PRAGMA journal_mode = WAL')
    _db.exec('PRAGMA foreign_keys = ON')
  }
  return _db
}

export function runMigrations() {
  const db = getDb()
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8')
  db.exec(schema)

  // Incremental column additions (safe to run multiple times)
  const alterations = [
    "ALTER TABLE jobs ADD COLUMN date_column TEXT",
    "ALTER TABLE jobs ADD COLUMN code_column TEXT",
    "ALTER TABLE jobs ADD COLUMN date_mode TEXT NOT NULL DEFAULT 'fixed'",
  ]
  for (const sql of alterations) {
    try { db.exec(sql) } catch { /* column already exists */ }
  }
}
