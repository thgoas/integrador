import type { FastifyInstance } from 'fastify'
import { getDb } from '../../db/sqlite.js'
import { startJob, stopJob } from '../../etl/runner.js'

export async function jobRoutes(app: FastifyInstance) {
  const db = getDb()

  app.get('/jobs', async () => {
    return db.prepare(`
      SELECT j.*, c.name AS connection_name, c.type AS connection_type,
        (SELECT id FROM runs WHERE job_id = j.id ORDER BY id DESC LIMIT 1) AS last_run_id,
        (SELECT status FROM runs WHERE job_id = j.id ORDER BY id DESC LIMIT 1) AS last_run_status,
        (SELECT started_at FROM runs WHERE job_id = j.id ORDER BY id DESC LIMIT 1) AS last_run_at
      FROM jobs j
      LEFT JOIN connections c ON j.connection_id = c.id
      ORDER BY j.id DESC
    `).all()
  })

  app.get<{ Params: { id: string } }>('/jobs/:id', async (req, reply) => {
    const job = db.prepare(`
      SELECT j.*, c.name AS connection_name, c.type AS connection_type
      FROM jobs j LEFT JOIN connections c ON j.connection_id = c.id
      WHERE j.id = ?
    `).get(req.params.id)
    if (!job) return reply.code(404).send({ error: 'Not found' })
    return job
  })

  app.post<{ Body: {
    name: string; connection_id: number; sql_template: string; destination_table: string;
    schema?: string; loja?: string; date_column?: string; code_column?: string;
    date_mode?: string; date_from?: string; date_to?: string;
    window_size?: string; concurrency?: number; chunk_size?: number;
    schedule_enabled?: number; schedule_cron?: string; monthly_reprocess?: number;
    field_mapping?: string;
    transform_script?: string;
  } }>('/jobs', async (req, reply) => {
    const { name, connection_id, sql_template, destination_table, schema, loja, date_column, code_column,
      date_mode = 'fixed', date_from, date_to,
      window_size = 'month', concurrency = 4, chunk_size = 5000,
      schedule_enabled = 0, schedule_cron, monthly_reprocess = 0, field_mapping, transform_script } = req.body
    const result = db.prepare(`
      INSERT INTO jobs (name, connection_id, sql_template, destination_table, schema, loja, date_column, code_column,
        date_mode, date_from, date_to, window_size, concurrency, chunk_size, schedule_enabled, schedule_cron, monthly_reprocess, field_mapping, transform_script)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(name, connection_id, sql_template, destination_table, schema ?? null, loja ?? null, date_column ?? null, code_column ?? null,
      date_mode, date_from ?? null, date_to ?? null, window_size, concurrency, chunk_size,
      schedule_enabled, schedule_cron ?? null, monthly_reprocess, field_mapping ?? null, transform_script ?? null)
    reply.code(201)
    return { id: result.lastInsertRowid }
  })

  app.put<{ Params: { id: string }; Body: Record<string, any> }>('/jobs/:id', async (req, reply) => {
    const existing = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id) as any
    if (!existing) return reply.code(404).send({ error: 'Not found' })
    const fields = ['name','connection_id','sql_template','destination_table','schema','loja','date_column','code_column',
      'date_mode','date_from','date_to','window_size','concurrency','chunk_size','schedule_enabled','schedule_cron','monthly_reprocess','field_mapping','transform_script']
    const merged = { ...existing, ...Object.fromEntries(fields.filter(f => req.body[f] !== undefined).map(f => [f, req.body[f]])) }
    db.prepare(`
      UPDATE jobs SET name=?,connection_id=?,sql_template=?,destination_table=?,schema=?,loja=?,date_column=?,code_column=?,
        date_mode=?,date_from=?,date_to=?,window_size=?,concurrency=?,chunk_size=?,schedule_enabled=?,
        schedule_cron=?,monthly_reprocess=?,field_mapping=?,transform_script=?,updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).run(merged.name, merged.connection_id, merged.sql_template, merged.destination_table,
      merged.schema, merged.loja, merged.date_column, merged.code_column,
      merged.date_mode, merged.date_from, merged.date_to, merged.window_size,
      merged.concurrency, merged.chunk_size, merged.schedule_enabled, merged.schedule_cron,
      merged.monthly_reprocess, merged.field_mapping ?? null, merged.transform_script ?? null, req.params.id)
    return { ok: true }
  })

  app.delete<{ Params: { id: string } }>('/jobs/:id', async (req, reply) => {
    const result = db.prepare('DELETE FROM jobs WHERE id = ?').run(req.params.id)
    if (result.changes === 0) return reply.code(404).send({ error: 'Not found' })
    return { ok: true }
  })

  app.post<{ Params: { id: string } }>('/jobs/:id/start', async (req, reply) => {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id) as any
    if (!job) return reply.code(404).send({ error: 'Not found' })
    if (job.status === 'running') return reply.code(409).send({ error: 'Job já está rodando' })
    const runId = await startJob(job)
    return { ok: true, run_id: runId }
  })

  app.post<{ Params: { id: string } }>('/jobs/:id/stop', async (req, reply) => {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id) as any
    if (!job) return reply.code(404).send({ error: 'Not found' })
    stopJob(Number(req.params.id))
    return { ok: true }
  })

  app.post<{ Params: { id: string }; Body: { date_from: string; date_to: string } }>(
    '/jobs/:id/reprocess',
    async (req, reply) => {
      const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id) as any
      if (!job) return reply.code(404).send({ error: 'Not found' })
      if (job.status === 'running') return reply.code(409).send({ error: 'Job já está rodando' })
      const override = { ...job, date_mode: 'fixed', date_from: req.body.date_from, date_to: req.body.date_to }
      const runId = await startJob(override)
      return { ok: true, run_id: runId }
    }
  )
}
