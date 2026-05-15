import { useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { getToken, clearToken, api } from './api'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Jobs } from './pages/Jobs'
import { JobForm } from './pages/JobForm'
import { JobDetail } from './pages/JobDetail'
import { Connections } from './pages/Connections'

const navStyle = (active: boolean): React.CSSProperties => ({
  display: 'block', padding: '8px 16px', borderRadius: 6, textDecoration: 'none',
  fontSize: 14, fontWeight: 500, color: active ? '#e2e8f0' : '#64748b',
  background: active ? '#2d3149' : 'transparent',
})

const btnNav: React.CSSProperties = {
  background: 'transparent', border: '1px solid #2d3149', borderRadius: 6,
  color: '#64748b', padding: '8px 16px', cursor: 'pointer', fontSize: 13,
  textAlign: 'left', width: '100%',
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (next !== confirm) { setError('As senhas não coincidem'); return }
    try {
      await api.auth.changePassword(cur, next)
      setOk(true)
    } catch (err: any) { setError(err.message) }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 12px', background: '#0f1117', border: '1px solid #2d3149',
    borderRadius: 6, color: '#e2e8f0', fontSize: 14, boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#94a3b8' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#00000088', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: '#1a1d27', border: '1px solid #2d3149', borderRadius: 10, padding: 28, width: 360 }}>
        <h2 style={{ color: '#e2e8f0', marginTop: 0, marginBottom: 20, fontSize: 16 }}>Trocar senha</h2>
        {ok ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#4ade80', marginBottom: 20 }}>Senha alterada com sucesso!</p>
            <button style={{ ...btnNav, border: '1px solid #4ade80', color: '#4ade80' }} onClick={onClose}>Fechar</button>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label style={lbl}>Senha atual
              <input style={inp} type="password" value={cur} onChange={e => setCur(e.target.value)} required autoFocus />
            </label>
            <label style={lbl}>Nova senha
              <input style={inp} type="password" value={next} onChange={e => setNext(e.target.value)} required minLength={6} />
            </label>
            <label style={lbl}>Confirmar nova senha
              <input style={inp} type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
            </label>
            {error && <p style={{ color: '#ef4444', margin: 0, fontSize: 13 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button type="submit" style={{ ...btnNav, background: '#6366f1', border: 'none', color: '#fff', flex: 1 }}>Salvar</button>
              <button type="button" style={btnNav} onClick={onClose}>Cancelar</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function AppShell({ onLogout }: { onLogout: () => void }) {
  const [changePwd, setChangePwd] = useState(false)

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav style={{ width: 220, background: '#1a1d27', borderRight: '1px solid #2d3149', padding: '24px 12px', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#818cf8', marginBottom: 32, padding: '0 8px' }}>
          ⚡ Integrador
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          <NavLink to="/" end style={({ isActive }) => navStyle(isActive)}>Dashboard</NavLink>
          <NavLink to="/jobs" style={({ isActive }) => navStyle(isActive)}>Jobs</NavLink>
          <NavLink to="/connections" style={({ isActive }) => navStyle(isActive)}>Conexões</NavLink>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button style={btnNav} onClick={() => setChangePwd(true)}>Trocar senha</button>
          <button style={btnNav} onClick={onLogout}>Sair</button>
        </div>
      </nav>
      {changePwd && <ChangePasswordModal onClose={() => setChangePwd(false)} />}

      <main style={{ flex: 1, overflowY: 'auto' }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/jobs/new" element={<JobForm />} />
          <Route path="/jobs/:id" element={<JobDetail />} />
          <Route path="/jobs/:id/edit" element={<JobForm />} />
          <Route path="/connections" element={<Connections />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  const [authed, setAuthed] = useState(() => Boolean(getToken()))

  const handleLogout = () => {
    clearToken()
    setAuthed(false)
  }

  if (!authed) {
    return <Login onLogin={() => setAuthed(true)} />
  }

  return (
    <BrowserRouter>
      <AppShell onLogout={handleLogout} />
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        a:hover { opacity: 0.85; }
        button:hover:not(:disabled) { opacity: 0.85; }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
        input:focus, select:focus, textarea:focus { border-color: #6366f1 !important; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2d3149; border-radius: 3px; }
      `}</style>
    </BrowserRouter>
  )
}
