const colors: Record<string, string> = {
  idle: '#64748b', running: '#6366f1', stopped: '#f59e0b',
  success: '#22c55e', failed: '#ef4444', info: '#64748b', warn: '#f59e0b', error: '#ef4444',
}

export function StatusBadge({ status }: { status: string }) {
  const color = colors[status] ?? '#64748b'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '2px 10px', borderRadius: 9999, fontSize: 12, fontWeight: 600,
      background: color + '22', color, border: `1px solid ${color}44`,
    }}>
      {status === 'running' && <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, animation: 'pulse 1s infinite' }} />}
      {status}
    </span>
  )
}
