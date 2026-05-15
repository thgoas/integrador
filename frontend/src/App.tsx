import { useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import { getToken, clearToken } from './api'
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

function AppShell({ onLogout }: { onLogout: () => void }) {
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
        <button
          onClick={onLogout}
          style={{
            background: 'transparent', border: '1px solid #2d3149', borderRadius: 6,
            color: '#64748b', padding: '8px 16px', cursor: 'pointer', fontSize: 13,
            textAlign: 'left', width: '100%',
          }}
        >
          Sair
        </button>
      </nav>

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
