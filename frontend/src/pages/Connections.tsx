import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Connection, ConnectionInput } from '../api'
import { s } from '../styles'

const emptyForm: ConnectionInput = { name: '', type: 'mssql', host: '', port: undefined, database: '', username: '', password: '' }

export function Connections() {
  const [connections, setConnections] = useState<Connection[]>([])
  const [form, setForm] = useState<ConnectionInput>(emptyForm)
  const [editing, setEditing] = useState<number | null>(null)
  const [testResult, setTestResult] = useState<Record<number, { ok: boolean; msg: string }>>({})
  const [error, setError] = useState('')

  const load = () => api.connections.list().then(setConnections).catch(() => {})
  useEffect(() => { load() }, [])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      if (editing) {
        await api.connections.update(editing, form)
        setEditing(null)
      } else {
        await api.connections.create(form)
      }
      setForm(emptyForm)
      load()
    } catch (err: any) { setError(err.message) }
  }

  const test = async (id: number) => {
    setTestResult(p => ({ ...p, [id]: { ok: false, msg: 'Testando...' } }))
    try {
      const r = await api.connections.test(id)
      setTestResult(p => ({ ...p, [id]: { ok: r.ok, msg: r.message ?? r.error ?? '' } }))
    } catch (err: any) {
      setTestResult(p => ({ ...p, [id]: { ok: false, msg: err.message } }))
    }
  }

  const del = async (id: number) => {
    if (!confirm('Remover conexão?')) return
    await api.connections.remove(id)
    load()
  }

  const startEdit = (c: Connection) => {
    setEditing(c.id)
    setForm({ name: c.name, type: c.type, host: c.host, port: c.port ?? undefined, database: c.database, username: c.username ?? '', password: '' })
  }

  return (
    <div style={s.page}>
      <h1 style={s.h1}>Conexões</h1>

      <div style={s.card}>
        <h2 style={s.h2}>{editing ? 'Editar Conexão' : 'Nova Conexão'}</h2>
        <form onSubmit={save} style={s.grid2}>
          <label style={s.label}>Nome
            <input style={s.input} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
          </label>
          <label style={s.label}>Tipo
            <select style={s.input} value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
              <option value="mssql">SQL Server</option>
              <option value="mysql">MySQL</option>
              <option value="postgres">PostgreSQL</option>
            </select>
          </label>
          <label style={s.label}>Host
            <input style={s.input} value={form.host} onChange={e => setForm(p => ({ ...p, host: e.target.value }))} required />
          </label>
          <label style={s.label}>Porta
            <input style={s.input} type="number" value={form.port ?? ''} onChange={e => setForm(p => ({ ...p, port: e.target.value ? Number(e.target.value) : undefined }))} placeholder={form.type === 'mssql' ? '1433' : form.type === 'mysql' ? '3306' : '5432'} />
          </label>
          <label style={s.label}>Banco de dados
            <input style={s.input} value={form.database} onChange={e => setForm(p => ({ ...p, database: e.target.value }))} required />
          </label>
          <label style={s.label}>Usuário
            <input style={s.input} value={form.username ?? ''} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} />
          </label>
          <label style={{ ...s.label, gridColumn: '1 / -1' }}>Senha {editing && <span style={{ color: '#64748b', fontSize: 12 }}>(deixe vazio para manter)</span>}
            <input style={s.input} type="password" value={form.password ?? ''} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
          </label>
          {error && <p style={{ color: '#ef4444', gridColumn: '1 / -1' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, gridColumn: '1 / -1' }}>
            <button style={s.btn} type="submit">{editing ? 'Salvar' : 'Criar'}</button>
            {editing && <button style={s.btnGhost} type="button" onClick={() => { setEditing(null); setForm(emptyForm) }}>Cancelar</button>}
          </div>
        </form>
      </div>

      <div style={s.card}>
        <h2 style={s.h2}>Conexões cadastradas</h2>
        {connections.length === 0 && <p style={{ color: '#64748b' }}>Nenhuma conexão cadastrada.</p>}
        <table style={s.table}>
          <thead><tr>
            <th style={s.th}>Nome</th><th style={s.th}>Tipo</th><th style={s.th}>Host</th>
            <th style={s.th}>Banco</th><th style={s.th}>Ações</th>
          </tr></thead>
          <tbody>
            {connections.map(c => (
              <tr key={c.id} style={s.tr}>
                <td style={s.td}>{c.name}</td>
                <td style={s.td}><code style={s.code}>{c.type}</code></td>
                <td style={s.td}>{c.host}{c.port ? `:${c.port}` : ''}</td>
                <td style={s.td}>{c.database}</td>
                <td style={{ ...s.td, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button style={s.btnSm} onClick={() => test(c.id)}>Testar</button>
                  <button style={s.btnSm} onClick={() => startEdit(c)}>Editar</button>
                  <button style={{ ...s.btnSm, color: '#ef4444' }} onClick={() => del(c.id)}>Remover</button>
                  {testResult[c.id] && (
                    <span style={{ color: testResult[c.id].ok ? '#22c55e' : '#ef4444', fontSize: 12, alignSelf: 'center' }}>
                      {testResult[c.id].msg}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
