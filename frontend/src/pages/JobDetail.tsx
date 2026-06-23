import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import type { Job, Run } from '../api'
import { StatusBadge } from '../components/StatusBadge'
import { RunLogViewer } from '../components/RunLogViewer'
import { s } from '../styles'

export function JobDetail() {
  const { id } = useParams<{ id: string }>()
  const [job, setJob] = useState<Job | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [activeRunId, setActiveRunId] = useState<number | null>(null)
  const [reprocessModal, setReprocessModal] = useState(false)
  const [repFrom, setRepFrom] = useState('')
  const [repTo, setRepTo] = useState('')
  const [repError, setRepError] = useState('')
  const [repLoading, setRepLoading] = useState(false)
  const [actionError, setActionError] = useState('')
  const [runsPage, setRunsPage] = useState(0)
  const RUNS_PER_PAGE = 10

  const load = async () => {
    const [j, r] = await Promise.all([api.jobs.get(Number(id)), api.runs.listByJob(Number(id))])
    setJob(j)
    setRuns(r)
    const running = r.find(x => x.status === 'running')
    if (running) setActiveRunId(running.id)
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [id])

  const start = async () => {
    setActionError('')
    try {
      const r = await api.jobs.start(Number(id))
      setActiveRunId(r.run_id)
      load()
    } catch (err: any) { setActionError(err.message) }
  }

  const stop = async () => { await api.jobs.stop(Number(id)); load() }

  const reprocess = async (e: React.FormEvent) => {
    e.preventDefault()
    setRepError('')
    setRepLoading(true)
    try {
      const r = await api.jobs.reprocess(Number(id), repFrom, repTo)
      setActiveRunId(r.run_id)
      setReprocessModal(false)
      setRepFrom('')
      setRepTo('')
      load()
    } catch (err: any) {
      setRepError(err.message)
    } finally {
      setRepLoading(false)
    }
  }

  const reprocessFailed = async (runId: number) => {
    setActionError('')
    try {
      const r = await api.jobs.reprocessFailed(Number(id), runId)
      setActiveRunId(r.run_id)
      load()
    } catch (err: any) { setActionError(err.message) }
  }

  const failedCount = (run: Run): number => {
    if (!run.failed_periods) return 0
    try { return JSON.parse(run.failed_periods).length } catch { return 0 }
  }

  if (!job) return <div style={s.page}><p style={{ color: '#64748b' }}>Carregando...</p></div>

  const latestRun = runs[0]

  return (
    <div style={s.page}>
      <div style={{ marginBottom: 8 }}>
        <Link to="/jobs" style={{ color: '#64748b', fontSize: 13, textDecoration: 'none' }}>← Jobs</Link>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ ...s.h1, marginBottom: 0 }}>{job.name}</h1>
          <StatusBadge status={job.status} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to={`/jobs/${id}/edit`} style={{ ...s.btnGhost, textDecoration: 'none', display: 'inline-block' }}>Editar</Link>
          <button style={s.btnGhost} onClick={() => { setReprocessModal(true); setRepError('') }}>↻ Reprocessar período</button>
          {job.status === 'running'
            ? <button style={s.btnDanger} onClick={stop}>Parar</button>
            : <button style={s.btnSuccess} onClick={start}>▶ Iniciar</button>
          }
        </div>
        {actionError && <p style={{ color: '#ef4444', fontSize: 13, margin: '8px 0 0' }}>{actionError}</p>}
      </div>

      {latestRun && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
          {[
            { label: 'Status do último run', value: <StatusBadge status={latestRun.status} /> },
            { label: 'Linhas lidas', value: latestRun.rows_read.toLocaleString() },
            { label: 'Linhas gravadas', value: latestRun.rows_written.toLocaleString() },
            { label: 'Início', value: new Date(latestRun.started_at).toLocaleString() },
          ].map(({ label, value }) => (
            <div key={label} style={{ ...s.card, marginBottom: 0 }}>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      <div style={s.card}>
        <h2 style={s.h2}>Configuração</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
          {[
            ['Conexão', job.connection_name],
            ['Tabela destino', job.destination_table],
            ['Schema', job.schema ?? '—'],
            ['Loja', job.loja ?? '—'],
            ['Período', job.date_mode === 'current_month' ? 'Mês atual (calculado na execução)' : job.date_mode === 'last_month' ? 'Mês anterior (calculado na execução)' : `${job.date_from} → ${job.date_to}`],
            ['Janela', job.window_size],
            ['Concorrência', job.concurrency],
            ['Chunk size', job.chunk_size],
            ['Coluna código', job.code_column ?? '—'],
            ['Agendamento', job.schedule_enabled ? job.schedule_cron ?? 'ativo' : 'desativado'],
            ['Reprocessamento mensal', job.monthly_reprocess ? 'ativo' : 'desativado'],
          ].map(([k, v]) => (
            <div key={k as string}><span style={{ color: '#64748b' }}>{k}: </span><span style={{ color: '#e2e8f0' }}>{v}</span></div>
          ))}
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={{ color: '#64748b', fontSize: 12, marginBottom: 6 }}>SQL Template</div>
          <pre style={{ ...s.textarea as object, overflowX: 'auto', whiteSpace: 'pre-wrap', fontSize: 12, color: '#94a3b8' }}>{job.sql_template}</pre>
        </div>
      </div>

      {activeRunId && (
        <div style={s.card}>
          <h2 style={s.h2}>Logs em tempo real — Run #{activeRunId}</h2>
          <RunLogViewer runId={activeRunId} />
        </div>
      )}

      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ ...s.h2, marginBottom: 0 }}>Histórico de runs</h2>
          {runs.length > RUNS_PER_PAGE && (
            <span style={{ fontSize: 12, color: '#64748b' }}>
              {runsPage * RUNS_PER_PAGE + 1}–{Math.min((runsPage + 1) * RUNS_PER_PAGE, runs.length)} de {runs.length}
            </span>
          )}
        </div>
        {runs.length === 0 && <p style={{ color: '#64748b' }}>Nenhum run executado.</p>}
        <table style={s.table}>
          <thead><tr>
            <th style={s.th}>#</th><th style={s.th}>Status</th><th style={s.th}>Lidas</th>
            <th style={s.th}>Gravadas</th><th style={s.th}>Início</th><th style={s.th}>Duração</th><th style={s.th}>Ações</th>
          </tr></thead>
          <tbody>
            {runs.slice(runsPage * RUNS_PER_PAGE, (runsPage + 1) * RUNS_PER_PAGE).map(run => {
              const dur = run.finished_at
                ? Math.round((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000)
                : null
              return (
                <tr key={run.id} style={s.tr}>
                  <td style={s.td}>{run.id}</td>
                  <td style={s.td}><StatusBadge status={run.status} /></td>
                  <td style={s.td}>{run.rows_read.toLocaleString()}</td>
                  <td style={s.td}>{run.rows_written.toLocaleString()}</td>
                  <td style={s.td}>{new Date(run.started_at).toLocaleString()}</td>
                  <td style={s.td}>{dur !== null ? `${dur}s` : '...'}</td>
                  <td style={s.td}>
                    <button style={s.btnSm} onClick={() => setActiveRunId(run.id)}>Ver logs</button>
                    {failedCount(run) > 0 && job.status !== 'running' && (
                      <button
                        style={{ ...s.btnSm, marginLeft: 8 }}
                        onClick={() => reprocessFailed(run.id)}
                        title={`Reprocessar ${failedCount(run)} janela(s) que falharam`}
                      >
                        Reprocessar falhas ({failedCount(run)})
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {runs.length > RUNS_PER_PAGE && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
            <button style={s.btnSm} disabled={runsPage === 0} onClick={() => setRunsPage(p => p - 1)}>← Anterior</button>
            <button style={s.btnSm} disabled={(runsPage + 1) * RUNS_PER_PAGE >= runs.length} onClick={() => setRunsPage(p => p + 1)}>Próximo →</button>
          </div>
        )}
      </div>

      {reprocessModal && (
        <div style={{ position: 'fixed', inset: 0, background: '#00000088', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ ...s.card, width: 420, margin: 0 }}>
            <h2 style={s.h2}>Reprocessar período</h2>
            <form onSubmit={reprocess} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={s.label}>Data inicial
                <input style={s.input} type="date" value={repFrom} onChange={e => setRepFrom(e.target.value)} required />
              </label>
              <label style={s.label}>Data final
                <input style={s.input} type="date" value={repTo} onChange={e => setRepTo(e.target.value)} required />
              </label>
              {repError && <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{repError}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={s.btn} type="submit" disabled={repLoading}>
                  {repLoading ? 'Executando...' : 'Executar'}
                </button>
                <button style={s.btnGhost} type="button" onClick={() => setReprocessModal(false)} disabled={repLoading}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
