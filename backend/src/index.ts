import 'dotenv/config'
import { buildServer } from './api/server.js'
import { runMigrations } from './db/sqlite.js'
import { startScheduler } from './scheduler/cron.js'
import { env } from './config/env.js'
import { destPool } from './config/destination.js'

async function main() {
  runMigrations()

  // Verify destination PostgreSQL is reachable at startup
  try {
    const client = await destPool.connect()
    const { rows } = await client.query('SELECT current_database()')
    client.release()
    console.log(`[dest-pg] Conectado ao banco "${rows[0].current_database}"`)
  } catch (err: any) {
    console.error(`[dest-pg] ERRO ao conectar ao banco de destino: ${err.message}`)
    console.error('[dest-pg] Verifique DEST_PG_HOST, DEST_PG_DATABASE, DEST_PG_USER e DEST_PG_PASSWORD no .env')
  }

  const app = await buildServer()
  await app.listen({ port: env.PORT, host: '0.0.0.0' })

  startScheduler()

  process.on('SIGINT', async () => {
    await app.close()
    process.exit(0)
  })
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
