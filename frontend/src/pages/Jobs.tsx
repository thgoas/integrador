import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import type { Job } from '../api'
import { StatusBadge } from '../components/StatusBadge'
import { s } from '../styles'

export function Jobs() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState<Record<number, boolean>>({})

  const load = () => api.jobs.list().then(setJobs).catch(() => {})

  useEffect(() => {
    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [])

  const start = async (id: number) => {
    setLoading(p => ({ ...p, [id]: true }))
    try { await api.jobs.start(id); load() }
    catch (err: any) { alert(err.message) }
    finally { setLoading(p => ({ ...p, [id]: false })) }
  }

  const stop = async (id: number) => {
    await api.jobs.stop(id)
    load()
  }

  const del = async (id: number) => {
    if (!confirm('Remover job e todo o histórico?')) return
    await api.jobs.remove(id)
    load()
  }

  return (
    <div style={s.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ ...s.h1, marginBottom: 0 }}>Jobs</h1>
        <Link to="/jobs/new" style={{ ...s.btn, textDecoration: 'none', display: 'inline-block' }}>+ Novo Job</Link>
      </div>

      {jobs.length === 0 && (
        <div style={s.card}>
          <p style={{ color: '#64748b', textAlign: 'center', padding: 32 }}>
            Nenhum job cadastrado. <Link to="/jobs/new" style={{ color: '#6366f1' }}>Criar primeiro job →</Link>
          </p>
        </div>
      )}

      {jobs.map(job => (
        <div key={job.id} style={{ ...s.card, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <Link to={`/jobs/${job.id}`} style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0', textDecoration: 'none' }}>
                  {job.name}
                </Link>
                <StatusBadge status={job.status} />
                {job.schedule_enabled ? <span style={{ fontSize: 11, color: '#6366f1', background: '#6366f122', padding: '1px 8px', borderRadius: 9999 }}>⏱ agendado</span> : null}
                {job.monthly_reprocess ? <span style={{ fontSize: 11, color: '#f59e0b', background: '#f59e0b22', padding: '1px 8px', borderRadius: 9999 }}>↻ reprocessamento mensal</span> : null}
              </div>
              <div style={{ fontSize: 13, color: '#64748b' }}>
                <span>{job.connection_name}</span>
                {job.loja && <span> · Loja: <code style={s.code}>{job.loja}</code></span>}
                <span> · {job.date_from} → {job.date_to}</span>
                <span> · janela: {job.window_size}</span>
                <span> · destino: <code style={s.code}>{job.destination_table}</code></span>
              </div>
              {job.last_run_status && (
                <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
                  Último run: <StatusBadge status={job.last_run_status} /> em {new Date(job.last_run_at!).toLocaleString()}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Link to={`/jobs/${job.id}/edit`} style={s.btnSm}>Editar</Link>
              {job.status === 'running'
                ? <button style={{ ...s.btnSm, color: '#f59e0b' }} onClick={() => stop(job.id)}>Parar</button>
                : <button style={{ ...s.btnSm, color: '#22c55e' }} onClick={() => start(job.id)} disabled={loading[job.id]}>
                    {loading[job.id] ? 'Iniciando...' : '▶ Iniciar'}
                  </button>
              }
              <Link to={`/jobs/${job.id}`} style={s.btnSm}>Logs</Link>
              <button style={{ ...s.btnSm, color: '#ef4444' }} onClick={() => del(job.id)}>Remover</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
