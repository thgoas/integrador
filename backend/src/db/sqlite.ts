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
    "ALTER TABLE jobs ADD COLUMN source_type TEXT NOT NULL DEFAULT 'db'",
    "ALTER TABLE jobs ADD COLUMN api_connection_id INTEGER",
    "ALTER TABLE jobs ADD COLUMN api_endpoint TEXT",
    "ALTER TABLE jobs ADD COLUMN api_method TEXT DEFAULT 'GET'",
    "ALTER TABLE jobs ADD COLUMN api_data_path TEXT",
    "ALTER TABLE jobs ADD COLUMN api_pagination_type TEXT DEFAULT 'none'",
    "ALTER TABLE jobs ADD COLUMN api_page_param TEXT DEFAULT 'page'",
    "ALTER TABLE jobs ADD COLUMN api_page_size INTEGER DEFAULT 100",
    "ALTER TABLE jobs ADD COLUMN api_next_path TEXT",
    "ALTER TABLE jobs ADD COLUMN api_config TEXT",
    "ALTER TABLE jobs ADD COLUMN webhook_url TEXT",
    "ALTER TABLE jobs ADD COLUMN field_mapping TEXT",
    "ALTER TABLE jobs ADD COLUMN transform_script TEXT",
    "ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE runs ADD COLUMN failed_periods TEXT",
  ]
  for (const sql of alterations) {
    try { db.exec(sql) } catch { /* column already exists */ }
  }

  // Ensure the first user (seeded admin) is marked as admin
  db.exec("UPDATE users SET is_admin = 1 WHERE id = (SELECT MIN(id) FROM users) AND is_admin = 0")

  db.exec(`
    CREATE TABLE IF NOT EXISTS api_tokens (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      token_hash   TEXT NOT NULL UNIQUE,
      last_used_at DATETIME,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
}
