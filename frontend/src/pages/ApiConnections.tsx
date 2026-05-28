import { useEffect, useState } from 'react'
import { api } from '../api'
import type { ApiConnection, ApiConnectionInput } from '../api'
import { s } from '../styles'

const emptyForm: ApiConnectionInput = { name: '', base_url: '', auth_type: 'none', auth_header: '', auth_value: '', headers: '' }

export function ApiConnections() {
  const [connections, setConnections] = useState<ApiConnection[]>([])
  const [form, setForm] = useState<ApiConnectionInput>(emptyForm)
  const [editing, setEditing] = useState<number | null>(null)
  const [testResult, setTestResult] = useState<Record<number, { ok: boolean; msg: string }>>({})
  const [error, setError] = useState('')

  const load = () => api.apiConnections.list().then(setConnections).catch(() => {})
  useEffect(() => { load() }, [])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      const payload = { ...form }
      if (!payload.auth_value) delete payload.auth_value
      if (!payload.auth_header) delete payload.auth_header
      if (!payload.headers) delete payload.headers
      if (editing) {
        await api.apiConnections.update(editing, payload)
        setEditing(null)
      } else {
        await api.apiConnections.create(payload)
      }
      setForm(emptyForm)
      load()
    } catch (err: any) { setError(err.message) }
  }

  const test = async (id: number) => {
    setTestResult(p => ({ ...p, [id]: { ok: false, msg: 'Testando...' } }))
    try {
      const r = await api.apiConnections.test(id)
      setTestResult(p => ({ ...p, [id]: { ok: r.ok, msg: r.message ?? r.error ?? '' } }))
    } catch (err: any) {
      setTestResult(p => ({ ...p, [id]: { ok: false, msg: err.message } }))
    }
  }

  const del = async (id: number) => {
    if (!confirm('Remover conexão API?')) return
    await api.apiConnections.remove(id)
    load()
  }

  const startEdit = (c: ApiConnection) => {
    setEditing(c.id)
    setForm({ name: c.name, base_url: c.base_url, auth_type: c.auth_type, auth_header: c.auth_header ?? '', auth_value: '', headers: c.headers ?? '' })
  }

  const f = (field: keyof ApiConnectionInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(p => ({ ...p, [field]: e.target.value }))
  }

  const authTypeLabel: Record<string, string> = { none: 'Nenhuma', bearer: 'Bearer Token', apikey: 'API Key (header)', basic: 'Basic (user:senha)' }

  return (
    <div style={s.page}>
      <h1 style={s.h1}>Conexões API</h1>

      <div style={s.card}>
        <h2 style={s.h2}>{editing ? 'Editar Conexão API' : 'Nova Conexão API'}</h2>
        <form onSubmit={save} style={s.grid2}>
          <label style={s.label}>Nome
            <input style={s.input} value={form.name} onChange={f('name')} required />
          </label>
          <label style={s.label}>URL Base
            <input style={s.input} value={form.base_url} onChange={f('base_url')} placeholder="https://api.exemplo.com/v1" required />
          </label>
          <label style={s.label}>Autenticação
            <select style={s.input} value={form.auth_type ?? 'none'} onChange={f('auth_type')}>
              <option value="none">Nenhuma</option>
              <option value="bearer">Bearer Token</option>
              <option value="apikey">API Key (header)</option>
              <option value="basic">Basic (user:senha)</option>
            </select>
          </label>
          {form.auth_type === 'apikey' && (
            <label style={s.label}>Nome do header
              <input style={s.input} value={form.auth_header ?? ''} onChange={f('auth_header')} placeholder="X-API-Key" />
            </label>
          )}
          {form.auth_type !== 'none' && (
            <label style={{ ...s.label, gridColumn: form.auth_type === 'apikey' ? undefined : '2 / 3' }}>
              {form.auth_type === 'bearer' ? 'Token' : form.auth_type === 'apikey' ? 'Valor' : 'user:senha'}
              {editing && <span style={{ color: '#64748b', fontSize: 12 }}> (deixe vazio para manter)</span>}
              <input style={s.input} type="password" value={form.auth_value ?? ''} onChange={f('auth_value')} placeholder={form.auth_type === 'basic' ? 'usuario:senha' : undefined} />
            </label>
          )}
          <label style={{ ...s.label, gridColumn: '1 / -1' }}>Headers extras (JSON, opcional)
            <textarea style={{ ...s.textarea, minHeight: 60 }} value={form.headers ?? ''} onChange={f('headers')} placeholder='{"X-Custom-Header": "valor"}' />
          </label>
          {error && <p style={{ color: '#ef4444', gridColumn: '1 / -1', margin: 0 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, gridColumn: '1 / -1' }}>
            <button style={s.btn} type="submit">{editing ? 'Salvar' : 'Criar'}</button>
            {editing && <button style={s.btnGhost} type="button" onClick={() => { setEditing(null); setForm(emptyForm) }}>Cancelar</button>}
          </div>
        </form>
      </div>

      <div style={s.card}>
        <h2 style={s.h2}>Conexões cadastradas</h2>
        {connections.length === 0 && <p style={{ color: '#64748b' }}>Nenhuma conexão API cadastrada.</p>}
        <table style={s.table}>
          <thead><tr>
            <th style={s.th}>Nome</th>
            <th style={s.th}>URL Base</th>
            <th style={s.th}>Auth</th>
            <th style={s.th}>Ações</th>
          </tr></thead>
          <tbody>
            {connections.map(c => (
              <tr key={c.id} style={s.tr}>
                <td style={s.td}>{c.name}</td>
                <td style={s.td}><code style={{ ...s.code, fontSize: 11 }}>{c.base_url}</code></td>
                <td style={s.td}><code style={s.code}>{authTypeLabel[c.auth_type] ?? c.auth_type}</code></td>
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
