import pg from 'pg'
import { env } from './env.js'

export const destPool = new pg.Pool({
  host: env.DEST_PG_HOST,
  port: env.DEST_PG_PORT,
  database: env.DEST_PG_DATABASE,
  user: env.DEST_PG_USER,
  password: env.DEST_PG_PASSWORD,
  max: 10,
})
