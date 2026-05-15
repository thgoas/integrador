import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import type { Job } from '../api'
import { StatusBadge } from '../components/StatusBadge'
import { s } from '../styles'

export function Dashboard() {
  const [jobs, setJobs] = useState<Job[]>([])

  useEffect(() => {
    const load = () => api.jobs.list().then(setJobs).catch(() => {})
    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [])

  const running = jobs.filter(j => j.status === 'running')
  const idle = jobs.filter(j => j.status === 'idle')

  return (
    <div style={s.page}>
      <h1 style={s.h1}>Dashboard</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total de Jobs', value: jobs.length, color: '#6366f1' },
          { label: 'Em Execução', value: running.length, color: '#22c55e' },
          { label: 'Aguardando', value: idle.length, color: '#64748b' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ ...s.card, marginBottom: 0, textAlign: 'center' }}>
            <div style={{ fontSize: 36, fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      {running.length > 0 && (
        <div style={s.card}>
          <h2 style={s.h2}>Em execução agora</h2>
          {running.map(job => (
            <div key={job.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #1e2235' }}>
              <div>
                <Link to={`/jobs/${job.id}`} style={{ color: '#e2e8f0', textDecoration: 'none', fontWeight: 500 }}>{job.name}</Link>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{job.connection_name} · {job.destination_table}</div>
              </div>
              <StatusBadge status="running" />
            </div>
          ))}
        </div>
      )}

      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ ...s.h2, marginBottom: 0 }}>Todos os Jobs</h2>
          <Link to="/jobs/new" style={{ ...s.btn, textDecoration: 'none', fontSize: 13, padding: '6px 16px' }}>+ Novo Job</Link>
        </div>
        {jobs.length === 0 && (
          <p style={{ color: '#64748b', textAlign: 'center', padding: '24px 0' }}>
            Nenhum job. <Link to="/jobs/new" style={{ color: '#6366f1' }}>Criar primeiro →</Link>
          </p>
        )}
        <table style={s.table}>
          <thead><tr>
            <th style={s.th}>Nome</th><th style={s.th}>Conexão</th><th style={s.th}>Destino</th>
            <th style={s.th}>Status</th><th style={s.th}>Último run</th><th style={s.th} />
          </tr></thead>
          <tbody>
            {jobs.map(job => (
              <tr key={job.id} style={s.tr}>
                <td style={s.td}><Link to={`/jobs/${job.id}`} style={{ color: '#818cf8', textDecoration: 'none' }}>{job.name}</Link></td>
                <td style={s.td}>{job.connection_name}</td>
                <td style={s.td}><code style={s.code}>{job.destination_table}</code></td>
                <td style={s.td}><StatusBadge status={job.status} /></td>
                <td style={s.td}>
                  {job.last_run_status
                    ? <span><StatusBadge status={job.last_run_status} /> {new Date(job.last_run_at!).toLocaleString()}</span>
                    : <span style={{ color: '#475569' }}>—</span>
                  }
                </td>
                <td style={s.td}><Link to={`/jobs/${job.id}`} style={{ color: '#6366f1', textDecoration: 'none', fontSize: 13 }}>Detalhes →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
