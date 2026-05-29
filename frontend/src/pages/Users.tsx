import { useState, useEffect, useCallback } from 'react'
import { api, getIsAdmin } from '../api'
import type { User } from '../api'

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

function fmt(dt: string) {
  return new Date(dt).toLocaleString('pt-BR')
}

export function Users() {
  const [users, setUsers] = useState<User[]>([])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async () => {
    try { setUsers(await api.users.list()) } catch {}
  }, [])

  useEffect(() => { load() }, [load])

  if (!getIsAdmin()) {
    return (
      <div style={{ padding: 32 }}>
        <p style={{ color: '#ef4444' }}>Acesso restrito a administradores.</p>
      </div>
    )
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (password !== confirm) { setError('As senhas não coincidem'); return }
    setCreating(true)
    try {
      await api.users.create(username.trim(), password, isAdmin)
      setSuccess(`Usuário "${username.trim()}" criado com sucesso.`)
      setUsername('')
      setPassword('')
      setConfirm('')
      setIsAdmin(false)
      await load()
    } catch (err: any) {
      setError(err.message ?? 'Erro ao criar usuário')
    } finally {
      setCreating(false)
    }
  }

  const remove = async (user: User) => {
    if (!window.confirm(`Remover o usuário "${user.username}"? Esta ação não pode ser desfeita.`)) return
    try {
      await api.users.remove(user.id)
      await load()
    } catch (err: any) {
      alert(err.message ?? 'Erro ao remover usuário')
    }
  }

  return (
    <div style={{ padding: 32, maxWidth: 800 }}>
      <h1 style={{ color: '#e2e8f0', fontSize: 22, fontWeight: 700, marginTop: 0, marginBottom: 6 }}>
        Usuários
      </h1>
      <p style={{ color: '#64748b', fontSize: 14, marginTop: 0, marginBottom: 28 }}>
        Gerencie os usuários com acesso à plataforma. Apenas administradores podem criar ou remover usuários.
      </p>

      {/* Create form */}
      <div style={{ background: '#1a1d27', border: '1px solid #2d3149', borderRadius: 10, padding: 20, marginBottom: 24 }}>
        <h2 style={{ color: '#e2e8f0', fontSize: 15, fontWeight: 600, margin: '0 0 16px' }}>Novo usuário</h2>
        <form onSubmit={create} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, color: '#94a3b8' }}>Usuário</label>
              <input style={inp} value={username} onChange={e => setUsername(e.target.value)} required autoComplete="off" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, color: '#94a3b8' }}>Senha</label>
              <input style={inp} type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, color: '#94a3b8' }}>Confirmar senha</label>
              <input style={inp} type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required autoComplete="new-password" />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#94a3b8' }}>
              <input
                type="checkbox"
                checked={isAdmin}
                onChange={e => setIsAdmin(e.target.checked)}
                style={{ accentColor: '#6366f1', width: 15, height: 15 }}
              />
              Administrador
            </label>
            <button type="submit" style={btn()} disabled={creating}>
              {creating ? 'Criando...' : 'Criar usuário'}
            </button>
          </div>

          {error && <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{error}</p>}
          {success && <p style={{ color: '#4ade80', fontSize: 13, margin: 0 }}>{success}</p>}
        </form>
      </div>

      {/* User list */}
      <div style={{ background: '#1a1d27', border: '1px solid #2d3149', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #2d3149' }}>
          <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 14 }}>Usuários cadastrados</span>
        </div>
        {users.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: 13, padding: 20, margin: 0 }}>Nenhum usuário encontrado.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2d3149' }}>
                {['Usuário', 'Perfil', 'Criado em', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 20px', color: '#64748b', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid #1e2130' }}>
                  <td style={{ padding: '12px 20px', color: '#e2e8f0', fontWeight: 500 }}>{u.username}</td>
                  <td style={{ padding: '12px 20px' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                      background: u.is_admin ? '#312e81' : '#1e2130',
                      color: u.is_admin ? '#818cf8' : '#64748b',
                    }}>
                      {u.is_admin ? 'Admin' : 'Usuário'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 20px', color: '#94a3b8' }}>{fmt(u.created_at)}</td>
                  <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                    <button style={btnGhost} onClick={() => remove(u)}>Remover</button>
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
