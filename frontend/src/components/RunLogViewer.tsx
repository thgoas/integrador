import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { RunLog } from '../api'

const levelColor: Record<string, string> = { info: '#94a3b8', warn: '#f59e0b', error: '#ef4444' }

export function RunLogViewer({ runId }: { runId: number }) {
  const [logs, setLogs] = useState<RunLog[]>([])
  const [status, setStatus] = useState<string>('running')
  const [stats, setStats] = useState({ rows_read: 0, rows_written: 0 })
  const [error, setError] = useState('')
  const lastIdRef = useRef(0)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLogs([])
    setError('')
    setStatus('running')
    lastIdRef.current = 0

    let active = true

    const poll = async () => {
      try {
        const data = await api.runs.logs(runId, lastIdRef.current)
        if (!active) return

        if (data.logs.length > 0) {
          lastIdRef.current = data.logs[data.logs.length - 1].id
          setLogs(prev => [...prev, ...data.logs])
        }
        setStatus(data.status)
        setStats({ rows_read: data.rows_read, rows_written: data.rows_written })

        if (data.status === 'running' && active) {
          setTimeout(poll, 2000)
        }
      } catch (err: any) {
        if (active) setError(`Erro ao carregar logs: ${err.message}`)
      }
    }

    poll()
    return () => { active = false }
  }, [runId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const statusColor: Record<string, string> = {
    running: '#6366f1', success: '#22c55e', failed: '#ef4444', stopped: '#f59e0b'
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 20, fontSize: 13, color: '#64748b', marginBottom: 10 }}>
        <span>Status: <strong style={{ color: statusColor[status] ?? '#94a3b8' }}>{status}</strong></span>
        <span>Lidas: <strong style={{ color: '#e2e8f0' }}>{stats.rows_read.toLocaleString()}</strong></span>
        <span>Gravadas: <strong style={{ color: '#e2e8f0' }}>{stats.rows_written.toLocaleString()}</strong></span>
        {status === 'running' && <span style={{ color: '#6366f1' }}>● atualizando a cada 2s</span>}
      </div>

      {error && <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 8 }}>{error}</p>}

      <div style={{
        background: '#0a0c12', borderRadius: 8, padding: 16,
        fontFamily: 'monospace', fontSize: 13, maxHeight: 420, overflowY: 'auto',
      }}>
        {logs.length === 0 && !error && (
          <span style={{ color: '#475569' }}>Carregando logs...</span>
        )}
        {logs.map((log, i) => (
          <div key={log.id ?? i} style={{ marginBottom: 3 }}>
            <span style={{ color: '#475569', marginRight: 8, userSelect: 'none' }}>
              {new Date(log.created_at).toLocaleTimeString()}
            </span>
            <span style={{
              color: levelColor[log.level], marginRight: 8,
              textTransform: 'uppercase', fontSize: 10, userSelect: 'none',
            }}>
              [{log.level}]
            </span>
            <span style={{ color: levelColor[log.level] }}>{log.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
