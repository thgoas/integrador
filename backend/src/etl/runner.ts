import pLimit from 'p-limit'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { getDb } from '../db/sqlite.js'
import { generatePeriods } from './periods.js'
import { renderTemplate } from './template.js'
import { extractChunked } from './extractor.js'
import { extractApiChunked } from './api-extractor.js'
import { ensureTable, syncColumns, deletePeriod, copyChunkToTable, upsertChunkToTable, alterColumnTypes, dropAutoUniqueIndexes } from './loader.js'
import { applyMapping, runTransformScript, resolveColumnTypes } from './transform.js'
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

function callWebhook(job: any, runId: number, status: string, logFn: typeof log) {
  if (!job.webhook_url) return
  const db = getDb()
  const run = db.prepare('SELECT * FROM runs WHERE id = ?').get(runId) as any
  fetch(job.webhook_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      job_id: job.id,
      job_name: job.name,
      run_id: runId,
      status,
      rows_read: run?.rows_read ?? 0,
      rows_written: run?.rows_written ?? 0,
      started_at: run?.started_at,
      finished_at: run?.finished_at,
    }),
    signal: AbortSignal.timeout(10000),
  }).catch((err: Error) => logFn(runId, 'warn', `Webhook falhou: ${err.message}`))
}

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

    const periods: { from: string; to: string }[] =
      job._periods_override ?? generatePeriods(date_from, date_to, job.window_size)
    log(runId, 'info', job._periods_override
      ? `Reprocessando ${periods.length} janela(s) que falharam`
      : `${periods.length} janela(s) gerada(s) (${job.window_size})`)

    const failedPeriods: { from: string; to: string }[] = []
    const limit = pLimit(job.concurrency ?? 4)
    let tableReady = false
    let columns: string[] = []
    let tableSetupPromise: Promise<void> | null = null

    const tasks = periods.map(period =>
      limit(async () => {
        if (signal.aborted) return

        const templateVars = {
          data_inicio: period.from,
          data_fim: period.to,
          loja: job.loja ?? '',
          schema: job.schema ?? '',
        }

        let chunkStream: AsyncGenerator<Record<string, any>[]>

        if (job.source_type === 'api') {
          let endpoint: string
          try {
            endpoint = renderTemplate(job.api_endpoint ?? '', templateVars)
          } catch (err: any) {
            log(runId, 'error', `Erro no template do endpoint: ${err.message}`)
            return
          }
          const method = (job.api_method ?? 'GET').toUpperCase()
          let body: string | null = null
          if (['POST', 'PUT', 'PATCH'].includes(method) && job.sql_template) {
            try {
              body = renderTemplate(job.sql_template, templateVars)
            } catch (err: any) {
              log(runId, 'error', `Erro no template do body: ${err.message}`)
              return
            }
          }
          let apiConfig: Record<string, any> = {}
          try { if (job.api_config) apiConfig = JSON.parse(job.api_config) } catch {}
          chunkStream = extractApiChunked(job.api_connection_id, endpoint, {
            method,
            body,
            data_path: job.api_data_path ?? '',
            pagination_type: job.api_pagination_type ?? 'none',
            page_param: job.api_page_param ?? 'page',
            page_size: job.api_page_size ?? 100,
            next_path: job.api_next_path ?? null,
            api_config: apiConfig,
          }, job.chunk_size ?? 5000)
        } else {
          let sql: string
          try {
            sql = renderTemplate(job.sql_template, templateVars)
          } catch (err: any) {
            log(runId, 'error', `Erro no template: ${err.message}`)
            return
          }
          chunkStream = extractChunked(job.connection_id, sql, job.chunk_size ?? 5000)
        }

        log(runId, 'info', `Extraindo ${period.from} → ${period.to}`)

        let periodRows = 0

        try {
          let chunkIndex = 0
          let mappingConfig: import('./transform.js').MappingConfig | null = null
          try { if (job.field_mapping) mappingConfig = JSON.parse(job.field_mapping) } catch {}

          for await (let chunk of chunkStream) {
            if (signal.aborted) break
            if (chunk.length === 0) continue

            if (mappingConfig) chunk = applyMapping(chunk, mappingConfig)

            if (job.transform_script) {
              try {
                chunk = runTransformScript(chunk, job.transform_script)
              } catch (err: any) {
                log(runId, 'error', `Erro no script de transformação: ${err.message}`)
                throw err
              }
            }

            // First chunk: create/verify table then delete the period
            if (!tableReady) {
              if (!tableSetupPromise) {
                columns = Object.keys(chunk[0])
                const sampleRow = chunk[0]
                const typeOverrides = mappingConfig ? resolveColumnTypes(mappingConfig) : {}
                tableSetupPromise = (async () => {
                  try {
                    log(runId, 'info', `Criando/verificando tabela destino: "${job.destination_table}"`)
                    await ensureTable(job.destination_table, columns, sampleRow, job.code_column, typeOverrides)
                    await syncColumns(job.destination_table, columns, sampleRow, typeOverrides)
                    // Modo DELETE+INSERT: remove índices únicos órfãos de uma config upsert
                    // anterior, que bloqueariam o INSERT (mesma chave reaparece em outros períodos).
                    if (!job.code_column) {
                      const dropped = await dropAutoUniqueIndexes(job.destination_table)
                      for (const idx of dropped) {
                        log(runId, 'info', `Índice único obsoleto removido: "${idx}" (modo DELETE+INSERT por período)`)
                      }
                    }
                    const altered = await alterColumnTypes(job.destination_table, typeOverrides)
                    for (const c of altered.changed) {
                      log(runId, 'info', `Tipo da coluna "${c.column}" alterado: ${c.from} → ${c.to}`)
                    }
                    for (const c of altered.failed) {
                      log(runId, 'warn', `Não foi possível alterar tipo da coluna "${c.column}" para ${c.to}: ${c.error}`)
                    }
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
          failedPeriods.push({ from: period.from, to: period.to })
        }
      })
    )

    await Promise.allSettled(tasks)
    if (failedPeriods.length > 0) {
      log(runId, 'warn', `${failedPeriods.length} janela(s) falharam — reprocessáveis via POST /jobs/:id/reprocess-failed`)
    }

    const finalStatus = signal.aborted ? 'stopped' : failedPeriods.length > 0 ? 'failed' : 'success'
    const errorMsg = failedPeriods.length > 0 ? `${failedPeriods.length} janela(s) falharam` : null
    db.prepare("UPDATE runs SET status = ?, error_msg = ?, failed_periods = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(finalStatus, errorMsg, failedPeriods.length > 0 ? JSON.stringify(failedPeriods) : null, runId)
    db.prepare("UPDATE jobs SET status = 'idle', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(job.id)
    log(runId, 'info', `Job finalizado: ${finalStatus}`)
    callWebhook(job, runId, finalStatus, log)
  } catch (err: any) {
    db.prepare("UPDATE runs SET status = 'failed', error_msg = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?").run(err.message, runId)
    db.prepare("UPDATE jobs SET status = 'idle', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(job.id)
    log(runId, 'error', `Erro fatal: ${err.message}`)
    callWebhook(job, runId, 'failed', log)
  } finally {
    activeJobs.delete(job.id)
  }
}
