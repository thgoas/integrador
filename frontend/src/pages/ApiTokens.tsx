import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import type { ApiToken } from '../api'

const inp: React.CSSProperties = {
  padding: '8px 12px', background: '#0f1117', border: '1px solid #2d3149',
  borderRadius: 6, color: '#e2e8f0', fontSize: 14, width: '100%', boxSizing: 'border-box',
}
const btn = (color = '#6366f1'): React.CSSProperties => ({
  padding: '8px 18px', background: color, border: 'none', borderRadius: 6,
  color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
})
const btnGhost: React.CSSProperties = {
  padding: '6px 12px', background: 'transparent', border: '1px solid #ef4444',
  borderRadius: 6, color: '#ef4444', fontSize: 12, cursor: 'pointer',
}

function fmt(dt: string | null) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('pt-BR')
}

export function ApiTokens() {
  const [tokens, setTokens] = useState<ApiToken[]>([])
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await api.tokens.list()
      setTokens(data)
    } catch {}
  }, [])

  useEffect(() => { load() }, [load])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const trimmed = name.trim()
    if (!trimmed) return
    setCreating(true)
    try {
      const res = await api.tokens.create(trimmed)
      setNewToken(res.token)
      setName('')
      await load()
    } catch (err: any) {
      setError(err.message ?? 'Erro ao criar token')
    } finally {
      setCreating(false)
    }
  }

  const revoke = async (id: number) => {
    if (!confirm('Revogar este token? Integrações que o usam perderão acesso imediatamente.')) return
    try {
      await api.tokens.revoke(id)
      await load()
    } catch (err: any) {
      alert(err.message ?? 'Erro ao revogar token')
    }
  }

  const copy = () => {
    if (!newToken) return
    if (navigator.clipboard) {
      navigator.clipboard.writeText(newToken).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    } else {
      // Fallback para HTTP (sem contexto seguro)
      const ta = document.createElement('textarea')
      ta.value = newToken
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div style={{ padding: 32, maxWidth: 800 }}>
      <h1 style={{ color: '#e2e8f0', fontSize: 22, fontWeight: 700, marginTop: 0, marginBottom: 6 }}>
        Tokens de API
      </h1>
      <p style={{ color: '#64748b', fontSize: 14, marginTop: 0, marginBottom: 28 }}>
        Tokens de longa duração para integrar Power BI e sistemas externos ao endpoint{' '}
        <code style={{ color: '#818cf8' }}>GET /api/data/*</code> sem precisar de login.
      </p>

      {/* Create form */}
      <div style={{ background: '#1a1d27', border: '1px solid #2d3149', borderRadius: 10, padding: 20, marginBottom: 24 }}>
        <h2 style={{ color: '#e2e8f0', fontSize: 15, fontWeight: 600, margin: '0 0 14px' }}>Gerar novo token</h2>
        <form onSubmit={create} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: '#94a3b8' }}>Nome / identificação</label>
            <input
              style={inp}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder='ex: Power BI Produção'
              required
            />
          </div>
          <button type="submit" style={btn()} disabled={creating}>
            {creating ? 'Gerando...' : 'Gerar Token'}
          </button>
        </form>
        {error && <p style={{ color: '#ef4444', fontSize: 13, margin: '10px 0 0' }}>{error}</p>}
      </div>

      {/* Token revealed once */}
      {newToken && (
        <div style={{ background: '#0f1117', border: '1px solid #4ade80', borderRadius: 10, padding: 20, marginBottom: 24 }}>
          <p style={{ color: '#4ade80', fontWeight: 600, fontSize: 13, margin: '0 0 10px' }}>
            Token gerado! Copie agora — ele não será exibido novamente.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <code style={{
              flex: 1, background: '#1a1d27', border: '1px solid #2d3149', borderRadius: 6,
              padding: '10px 14px', color: '#818cf8', fontSize: 13, wordBreak: 'break-all',
            }}>
              {newToken}
            </code>
            <button onClick={copy} style={btn(copied ? '#4ade80' : '#6366f1')}>
              {copied ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
          <p style={{ color: '#64748b', fontSize: 12, margin: '10px 0 0' }}>
            Use como header: <code style={{ color: '#94a3b8' }}>Authorization: Bearer {newToken.slice(0, 12)}…</code>
          </p>
        </div>
      )}

      {/* Token list */}
      <div style={{ background: '#1a1d27', border: '1px solid #2d3149', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #2d3149' }}>
          <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 14 }}>Tokens ativos</span>
        </div>
        {tokens.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: 13, padding: '20px', margin: 0 }}>Nenhum token criado ainda.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2d3149' }}>
                {['Nome', 'Criado em', 'Último uso', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 20px', color: '#64748b', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tokens.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid #1e2130' }}>
                  <td style={{ padding: '12px 20px', color: '#e2e8f0' }}>{t.name}</td>
                  <td style={{ padding: '12px 20px', color: '#94a3b8' }}>{fmt(t.created_at)}</td>
                  <td style={{ padding: '12px 20px', color: t.last_used_at ? '#94a3b8' : '#374151' }}>
                    {fmt(t.last_used_at)}
                  </td>
                  <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                    <button style={btnGhost} onClick={() => revoke(t.id)}>Revogar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
