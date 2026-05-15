import pLimit from 'p-limit'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { getDb } from '../db/sqlite.js'
import { generatePeriods } from './periods.js'
import { renderTemplate } from './template.js'
import { extractChunked } from './extractor.js'
import { ensureTable, syncColumns, deletePeriod, copyChunkToTable, upsertChunkToTable } from './loader.js'
import { broadcastLog } from '../api/sse.js'

function resolveDates(job: any): { date_from: string; date_to: string } {
  const now = new Date()
  if (job.date_mode === 'current_month') {
    return { date_from: format(startOfMonth(now), 'yyyy-MM-dd'), date_to: format(now, 'yyyy-MM-dd') }
  }
  if (job.date_mode === 'last_month') {
    const prev = subMonths(now, 1)
    return { date_from: format(startOfMonth(prev), 'yyyy-MM-dd'), date_to: format(endOfMonth(prev), 'yyyy-MM-dd') }
  }
  return { date_from: job.date_from, date_to: job.date_to }
}

const activeJobs = new Map<number, AbortController>()

function log(runId: number, level: 'info' | 'warn' | 'error', message: string) {
  const db = getDb()
  const row = db.prepare('INSERT INTO run_logs (run_id, level, message) VALUES (?,?,?) RETURNING *').get(runId, level, message) as any
  broadcastLog(runId, row)
}

function updateRunStats(runId: number, rowsRead: number, rowsWritten: number) {
  getDb().prepare('UPDATE runs SET rows_read = rows_read + ?, rows_written = rows_written + ? WHERE id = ?')
    .run(rowsRead, rowsWritten, runId)
}

export async function startJob(job: any): Promise<number> {
  const db = getDb()
  const run = db.prepare('INSERT INTO runs (job_id, status) VALUES (?,?) RETURNING id').get(job.id, 'running') as { id: number }
  const runId = run.id
  db.prepare("UPDATE jobs SET status = 'running', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(job.id)

  const controller = new AbortController()
  activeJobs.set(job.id, controller)

  runPipeline(job, runId, controller.signal).catch(() => {})

  return runId
}

export function stopJob(jobId: number) {
  activeJobs.get(jobId)?.abort()
}

async function runPipeline(job: any, runId: number, signal: AbortSignal) {
  const db = getDb()

  try {
    const { date_from, date_to } = resolveDates(job)
    log(runId, 'info', `Iniciando job "${job.name}" — ${date_from} a ${date_to}`)
    if (job.code_column) {
      log(runId, 'info', `Modo upsert ativo — coluna código: "${job.code_column}"`)
    } else if (job.date_column) {
      log(runId, 'info', `Modo DELETE + INSERT por período — coluna data: "${job.date_column}"`)
    } else {
      log(runId, 'warn', 'Sem coluna código nem coluna data — dados serão inseridos sem deduplicação.')
    }

    const periods = generatePeriods(date_from, date_to, job.window_size)
    log(runId, 'info', `${periods.length} janela(s) gerada(s) (${job.window_size})`)

    const limit = pLimit(job.concurrency ?? 4)
    let tableReady = false
    let columns: string[] = []
    let tableSetupPromise: Promise<void> | null = null

    const tasks = periods.map(period =>
      limit(async () => {
        if (signal.aborted) return

        let sql: string
        try {
          sql = renderTemplate(job.sql_template, {
            data_inicio: period.from,
            data_fim: period.to,
            loja: job.loja ?? '',
            schema: job.schema ?? '',
          })
        } catch (err: any) {
          log(runId, 'error', `Erro no template: ${err.message}`)
          return
        }

        log(runId, 'info', `Extraindo ${period.from} → ${period.to}`)

        let periodRows = 0

        try {
          let chunkIndex = 0
          for await (const chunk of extractChunked(job.connection_id, sql, job.chunk_size ?? 5000)) {
            if (signal.aborted) break
            if (chunk.length === 0) continue

            // First chunk: create/verify table then delete the period
            if (!tableReady) {
              if (!tableSetupPromise) {
                columns = Object.keys(chunk[0])
                const sampleRow = chunk[0]
                tableSetupPromise = (async () => {
                  try {
                    log(runId, 'info', `Criando/verificando tabela destino: "${job.destination_table}"`)
                    await ensureTable(job.destination_table, columns, sampleRow, job.code_column)
                    await syncColumns(job.destination_table, columns, sampleRow)
                    log(runId, 'info', `Tabela OK. Colunas: ${columns.join(', ')}`)
                    tableReady = true
                  } catch (err: any) {
                    log(runId, 'error', `Falha ao criar tabela destino: ${err.message}`)
                    throw err
                  }
                })()
              }
              await tableSetupPromise
            }

            // Upsert path: INSERT ON CONFLICT DO UPDATE usando code_column
            if (job.code_column) {
              try {
                await upsertChunkToTable(job.destination_table, job.code_column, columns, chunk)
              } catch (err: any) {
                log(runId, 'error', `Erro no upsert (chunk ${chunkIndex}, ${chunk.length} linhas): ${err.message}`)
                throw err
              }
            } else {
              // Delete + insert path: remove o período antes do primeiro chunk da janela
              if (periodRows === 0 && job.date_column) {
                const deleted = await deletePeriod(job.destination_table, job.date_column, period.from, period.to)
                if (deleted > 0) {
                  log(runId, 'info', `Deletadas ${deleted} linha(s) de ${period.from} → ${period.to}`)
                }
              }
              try {
                await copyChunkToTable(job.destination_table, columns, chunk)
              } catch (err: any) {
                log(runId, 'error', `Erro no COPY (chunk ${chunkIndex}, ${chunk.length} linhas): ${err.message}`)
                throw err
              }
            }
            periodRows += chunk.length
            chunkIndex++
          }

          if (periodRows === 0) {
            log(runId, 'info', `Sem dados: ${period.from} → ${period.to}`)
          } else {
            updateRunStats(runId, periodRows, periodRows)
            log(runId, 'info', `✓ ${period.from} → ${period.to}: ${periodRows} linha(s) inserida(s)`)
          }
        } catch (err: any) {
          log(runId, 'error', `Erro em ${period.from} → ${period.to}: ${err.message}`)
        }
      })
    )

    const results = await Promise.allSettled(tasks)
    const failures = results.filter(r => r.status === 'rejected').length
    if (failures > 0) log(runId, 'warn', `${failures} janela(s) falharam`)

    const finalStatus = signal.aborted ? 'stopped' : 'success'
    db.prepare("UPDATE runs SET status = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?").run(finalStatus, runId)
    db.prepare("UPDATE jobs SET status = 'idle', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(job.id)
    log(runId, 'info', `Job finalizado: ${finalStatus}`)
  } catch (err: any) {
    db.prepare("UPDATE runs SET status = 'failed', error_msg = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?").run(err.message, runId)
    db.prepare("UPDATE jobs SET status = 'idle', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(job.id)
    log(runId, 'error', `Erro fatal: ${err.message}`)
  } finally {
    activeJobs.delete(job.id)
  }
}
