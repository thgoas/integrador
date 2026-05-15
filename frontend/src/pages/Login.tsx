import { useState } from 'react'
import { api, setToken } from '../api'

export function Login({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.auth.login(username, password)
      setToken(res.token)
      onLogin()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0f1117',
    }}>
      <div style={{
        background: '#1a1d27', border: '1px solid #2d3149', borderRadius: 12,
        padding: '40px 48px', width: 380,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⚡</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#818cf8', margin: 0 }}>Integrador</h1>
          <p style={{ color: '#64748b', fontSize: 14, marginTop: 6 }}>Entre para continuar</p>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#94a3b8' }}>
            Usuário
            <input
              style={{
                background: '#0f1117', border: '1px solid #2d3149', borderRadius: 6,
                padding: '10px 14px', color: '#e2e8f0', fontSize: 14, outline: 'none',
              }}
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus
              required
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#94a3b8' }}>
            Senha
            <input
              type="password"
              style={{
                background: '#0f1117', border: '1px solid #2d3149', borderRadius: 6,
                padding: '10px 14px', color: '#e2e8f0', fontSize: 14, outline: 'none',
              }}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </label>

          {error && (
            <p style={{ color: '#ef4444', fontSize: 13, margin: 0, textAlign: 'center' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6,
              padding: '11px', fontWeight: 600, fontSize: 15, cursor: 'pointer',
              marginTop: 4, opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
