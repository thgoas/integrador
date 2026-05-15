import { getDb } from '../db/sqlite.js'
import { decrypt } from '../db/crypto.js'

interface Connection {
  type: 'mssql' | 'mysql' | 'postgres'
  host: string
  port: number | null
  database: string
  username: string | null
  password: string | null
}

export async function* extractChunked(
  connectionId: number,
  sql: string,
  chunkSize: number
): AsyncGenerator<Record<string, any>[]> {
  const db = getDb()
  const conn = db.prepare('SELECT * FROM connections WHERE id = ?').get(connectionId) as unknown as Connection & { id: number }
  if (!conn) throw new Error(`Connection ${connectionId} not found`)

  const password = conn.password ? decrypt(conn.password) : ''

  if (conn.type === 'mssql') {
    yield* extractMssql(conn, password, sql, chunkSize)
  } else if (conn.type === 'mysql') {
    yield* extractMysql(conn, password, sql, chunkSize)
  } else {
    yield* extractPg(conn, password, sql, chunkSize)
  }
}

async function* extractMssql(conn: Connection, password: string, sql: string, chunkSize: number) {
  const mssql = await import('mssql')
  const pool = await mssql.default.connect({
    server: conn.host,
    port: conn.port ?? 1433,
    database: conn.database,
    user: conn.username ?? undefined,
    password,
    options: { trustServerCertificate: true },
    requestTimeout: 300000,
  })

  try {
    const request = pool.request()
    request.stream = true

    let chunk: Record<string, any>[] = []
    let resolve: (() => void) | null = null
    let reject: ((e: Error) => void) | null = null
    let done = false
    const queue: Record<string, any>[][] = []

    const flush = () => {
      if (chunk.length > 0) { queue.push(chunk); chunk = [] }
    }

    request.on('row', (row: Record<string, any>) => {
      chunk.push(row)
      if (chunk.length >= chunkSize) { flush(); resolve?.(); resolve = null }
    })
    request.on('done', () => { flush(); done = true; resolve?.(); resolve = null })
    request.on('error', (err: Error) => { reject?.(err); reject = null })
    request.query(sql)

    while (!done || queue.length > 0) {
      if (queue.length > 0) { yield queue.shift()!; continue }
      if (done) break
      await new Promise<void>((res, rej) => { resolve = res; reject = rej })
    }
  } finally {
    await pool.close()
  }
}

async function* extractMysql(conn: Connection, password: string, sql: string, chunkSize: number) {
  const mysql = await import('mysql2/promise')
  const connection = await mysql.default.createConnection({
    host: conn.host,
    port: conn.port ?? 3306,
    database: conn.database,
    user: conn.username ?? undefined,
    password,
  })

  try {
    const [rows] = await connection.execute(sql)
    const all = rows as Record<string, any>[]
    for (let i = 0; i < all.length; i += chunkSize) {
      yield all.slice(i, i + chunkSize)
    }
  } finally {
    await connection.end()
  }
}

async function* extractPg(conn: Connection, password: string, sql: string, chunkSize: number) {
  const pg = await import('pg')
  const { default: QueryStream } = await import('pg-query-stream')
  const client = new pg.default.Client({
    host: conn.host,
    port: conn.port ?? 5432,
    database: conn.database,
    user: conn.username ?? undefined,
    password,
  })
  await client.connect()

  try {
    const stream = client.query(new QueryStream(sql, [], { batchSize: chunkSize }))
    let chunk: Record<string, any>[] = []
    for await (const row of stream) {
      chunk.push(row)
      if (chunk.length >= chunkSize) {
        yield chunk
        chunk = []
      }
    }
    if (chunk.length > 0) yield chunk
  } finally {
    await client.end()
  }
}
