import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import type { Connection, JobInput } from '../api'
import { s } from '../styles'

const TEMPLATE_EXAMPLE = `SELECT
  id,
  data_venda,
  loja_id,
  produto_id,
  quantidade,
  valor_total,
  updated_at
FROM {{schema}}.vendas
WHERE loja_id IN ({{loja}})
  AND data_venda BETWEEN '{{data_inicio}}' AND '{{data_fim}}'`

const defaultForm: JobInput = {
  name: '', connection_id: 0, sql_template: TEMPLATE_EXAMPLE,
  destination_table: '', schema: '', loja: '', date_column: '', code_column: '',
  date_mode: 'fixed', date_from: '', date_to: '', window_size: 'month', concurrency: 4, chunk_size: 5000,
  schedule_enabled: 0, schedule_cron: '', monthly_reprocess: 0,
}

export function JobForm() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const [form, setForm] = useState<JobInput>(defaultForm)
  const [connections, setConnections] = useState<Connection[]>([])
  const [error, setError] = useState('')
  const isEdit = Boolean(id)

  useEffect(() => {
    api.connections.list().then(setConnections)
    if (id) {
      api.jobs.get(Number(id)).then(j => setForm({
        name: j.name, connection_id: j.connection_id, sql_template: j.sql_template,
        destination_table: j.destination_table, schema: j.schema ?? '', loja: j.loja ?? '', date_column: j.date_column ?? '', code_column: j.code_column ?? '',
        date_mode: j.date_mode ?? 'fixed', date_from: j.date_from ?? '', date_to: j.date_to ?? '', window_size: j.window_size,
        concurrency: j.concurrency, chunk_size: j.chunk_size,
        schedule_enabled: j.schedule_enabled, schedule_cron: j.schedule_cron ?? '',
        monthly_reprocess: j.monthly_reprocess,
      }))
    }
  }, [id])

  const f = (field: keyof JobInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const v = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked ? 1 : 0 : e.target.value
    setForm(p => ({ ...p, [field]: v }))
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      const data = { ...form, concurrency: Number(form.concurrency), chunk_size: Number(form.chunk_size) }
      if (isEdit) await api.jobs.update(Number(id), data)
      else await api.jobs.create(data)
      navigate('/jobs')
    } catch (err: any) { setError(err.message) }
  }

  return (
    <div style={s.page}>
      <h1 style={s.h1}>{isEdit ? 'Editar Job' : 'Novo Job'}</h1>
      <form onSubmit={save}>
        <div style={s.card}>
          <h2 style={s.h2}>Configuração Geral</h2>
          <div style={s.grid2}>
            <label style={s.label}>Nome do job
              <input style={s.input} value={form.name} onChange={f('name')} required />
            </label>
            <label style={s.label}>Conexão de origem
              <select style={s.input} value={form.connection_id} onChange={f('connection_id')} required>
                <option value="">Selecione...</option>
                {connections.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
              </select>
            </label>
            <label style={s.label}>Schema (valor de &#123;&#123;schema&#125;&#125;)
              <input style={s.input} value={form.schema ?? ''} onChange={f('schema')} placeholder="dbo" />
            </label>
            <label style={s.label}>Lojas — separadas por vírgula (valor de &#123;&#123;loja&#125;&#125;)
              <input style={s.input} value={form.loja ?? ''} onChange={f('loja')} placeholder="001,002,003" />
            </label>
            <label style={s.label}>Tabela de destino (PostgreSQL)
              <input style={s.input} value={form.destination_table} onChange={f('destination_table')} placeholder="fact_vendas" required />
            </label>
            <label style={s.label}>
              Coluna código (chave única para upsert)
              <span style={{ fontSize: 11, color: '#475569', marginLeft: 4 }}>se preenchida, usa INSERT ON CONFLICT DO UPDATE</span>
              <input style={s.input} value={form.code_column ?? ''} onChange={f('code_column')} placeholder="numero" />
            </label>
            <label style={s.label}>
              Coluna de data para DELETE por período
              <span style={{ fontSize: 11, color: '#475569', marginLeft: 4 }}>ignorada quando coluna código está preenchida</span>
              <input style={s.input} value={form.date_column ?? ''} onChange={f('date_column')} placeholder="data_venda" />
            </label>
            <label style={s.label}>Modo de período
              <select style={s.input} value={form.date_mode ?? 'fixed'} onChange={f('date_mode')}>
                <option value="fixed">Fixo (datas definidas abaixo)</option>
                <option value="current_month">Mês atual (calculado na execução)</option>
                <option value="last_month">Mês anterior (calculado na execução)</option>
              </select>
            </label>
            <div />
            {(form.date_mode ?? 'fixed') === 'fixed' ? (
              <>
                <label style={s.label}>Data inicial
                  <input style={s.input} type="date" value={form.date_from ?? ''} onChange={f('date_from')} required />
                </label>
                <label style={s.label}>Data final
                  <input style={s.input} type="date" value={form.date_to ?? ''} onChange={f('date_to')} required />
                </label>
              </>
            ) : (
              <div style={{ gridColumn: '1 / -1', padding: '10px 14px', background: '#1e293b', borderRadius: 6, fontSize: 13, color: '#94a3b8' }}>
                {form.date_mode === 'current_month'
                  ? 'As datas serão calculadas automaticamente: do primeiro dia do mês atual até hoje.'
                  : 'As datas serão calculadas automaticamente: do primeiro ao último dia do mês anterior.'}
              </div>
            )}
            <label style={s.label}>Janela de execução
              <select style={s.input} value={form.window_size} onChange={f('window_size')}>
                <option value="day">Diária</option>
                <option value="week">Semanal</option>
                <option value="month">Mensal</option>
              </select>
            </label>
            <label style={s.label}>Concorrência (janelas paralelas)
              <input style={s.input} type="number" min={1} max={20} value={form.concurrency} onChange={f('concurrency')} />
            </label>
            <label style={s.label}>Tamanho do chunk (linhas)
              <input style={s.input} type="number" min={100} value={form.chunk_size} onChange={f('chunk_size')} />
            </label>
          </div>
        </div>

        <div style={s.card}>
          <h2 style={s.h2}>Query SQL Template</h2>
          <p style={{ color: '#64748b', fontSize: 13, marginBottom: 12 }}>
            Variáveis disponíveis:{' '}
            <code style={s.code}>&#123;&#123;data_inicio&#125;&#125;</code>{' '}
            <code style={s.code}>&#123;&#123;data_fim&#125;&#125;</code>{' '}
            <code style={s.code}>&#123;&#123;schema&#125;&#125;</code>{' '}
            <code style={s.code}>&#123;&#123;loja&#125;&#125;</code>
            <span style={{ marginLeft: 8, color: '#475569' }}>
              → renderiza como lista SQL: <code style={{ ...s.code, color: '#94a3b8' }}>'001', '002', '003'</code> — use com <code style={{ ...s.code, color: '#94a3b8' }}>IN (&#123;&#123;loja&#125;&#125;)</code>
            </span>
          </p>
          <textarea style={{ ...s.textarea, minHeight: 220 }} value={form.sql_template} onChange={f('sql_template')} required />
        </div>

        <div style={s.card}>
          <h2 style={s.h2}>Agendamento Automático</h2>
          <div style={s.grid2}>
            <label style={{ ...s.label, flexDirection: 'row', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={Boolean(form.schedule_enabled)} onChange={f('schedule_enabled')} style={{ width: 16, height: 16 }} />
              Habilitar agendamento automático
            </label>
            <div />
            {Boolean(form.schedule_enabled) && (
              <label style={s.label}>Expressão Cron (executa o mês atual)
                <input style={s.input} value={form.schedule_cron ?? ''} onChange={f('schedule_cron')} placeholder="0 */2 * * *  (a cada 2 horas)" />
              </label>
            )}
            <label style={{ ...s.label, flexDirection: 'row', alignItems: 'center', gap: 10, cursor: 'pointer', gridColumn: '1 / -1' }}>
              <input type="checkbox" checked={Boolean(form.monthly_reprocess)} onChange={f('monthly_reprocess')} style={{ width: 16, height: 16 }} />
              Reprocessar o mês anterior automaticamente no dia 1 de cada mês
            </label>
          </div>
        </div>

        {error && <p style={{ color: '#ef4444', marginBottom: 16 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.btn} type="submit">{isEdit ? 'Salvar alterações' : 'Criar job'}</button>
          <button style={s.btnGhost} type="button" onClick={() => navigate('/jobs')}>Cancelar</button>
        </div>
      </form>
    </div>
  )
}
