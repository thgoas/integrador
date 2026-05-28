import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import type { Connection, ApiConnection, JobInput } from '../api'
import { s } from '../styles'

const SQL_EXAMPLE = `SELECT
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
  name: '', source_type: 'db', connection_id: 0, sql_template: SQL_EXAMPLE,
  destination_table: '', schema: '', loja: '', date_column: '', code_column: '',
  date_mode: 'fixed', date_from: '', date_to: '', window_size: 'month', concurrency: 4, chunk_size: 5000,
  schedule_enabled: 0, schedule_cron: '', monthly_reprocess: 0,
  api_connection_id: 0, api_endpoint: '', api_method: 'GET', api_data_path: '',
  api_pagination_type: 'none', api_page_param: 'page', api_page_size: 100,
  api_next_path: '', api_config: '', webhook_url: '', field_mapping: '', transform_script: '',
}

export function JobForm() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const [form, setForm] = useState<JobInput>(defaultForm)
  const [connections, setConnections] = useState<Connection[]>([])
  const [apiConns, setApiConns] = useState<ApiConnection[]>([])
  const [error, setError] = useState('')
  const isEdit = Boolean(id)

  useEffect(() => {
    api.connections.list().then(setConnections)
    api.apiConnections.list().then(setApiConns)
    if (id) {
      api.jobs.get(Number(id)).then(j => setForm({
        name: j.name,
        source_type: j.source_type ?? 'db',
        connection_id: j.connection_id ?? 0,
        sql_template: j.sql_template,
        destination_table: j.destination_table,
        schema: j.schema ?? '',
        loja: j.loja ?? '',
        date_column: j.date_column ?? '',
        code_column: j.code_column ?? '',
        date_mode: j.date_mode ?? 'fixed',
        date_from: j.date_from ?? '',
        date_to: j.date_to ?? '',
        window_size: j.window_size,
        concurrency: j.concurrency,
        chunk_size: j.chunk_size,
        schedule_enabled: j.schedule_enabled,
        schedule_cron: j.schedule_cron ?? '',
        monthly_reprocess: j.monthly_reprocess,
        api_connection_id: j.api_connection_id ?? 0,
        api_endpoint: j.api_endpoint ?? '',
        api_method: j.api_method ?? 'GET',
        api_data_path: j.api_data_path ?? '',
        api_pagination_type: j.api_pagination_type ?? 'none',
        api_page_param: j.api_page_param ?? 'page',
        api_page_size: j.api_page_size ?? 100,
        api_next_path: j.api_next_path ?? '',
        api_config: j.api_config ?? '',
        webhook_url: j.webhook_url ?? '',
        field_mapping: j.field_mapping ?? '',
        transform_script: j.transform_script ?? '',
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
      const trimmedMapping = (form.field_mapping ?? '').trim()
      if (trimmedMapping) {
        try { JSON.parse(trimmedMapping) } catch { setError('Mapeamento de campos: JSON inválido'); return }
      }
      const trimmedScript = (form.transform_script ?? '').trim()
      const data: JobInput = {
        ...form,
        concurrency: Number(form.concurrency),
        chunk_size: Number(form.chunk_size),
        api_page_size: Number(form.api_page_size),
        field_mapping: trimmedMapping || undefined,
        transform_script: trimmedScript || undefined,
      }
      if (data.source_type === 'db') {
        data.connection_id = Number(data.connection_id)
      } else {
        data.api_connection_id = Number(data.api_connection_id)
        delete data.connection_id
      }
      if (isEdit) await api.jobs.update(Number(id), data)
      else await api.jobs.create(data)
      navigate('/jobs')
    } catch (err: any) { setError(err.message) }
  }

  const isApi = form.source_type === 'api'
  const apiMethod = (form.api_method ?? 'GET').toUpperCase()
  const needsBody = ['POST', 'PUT', 'PATCH'].includes(apiMethod)
  const showPagination = form.api_pagination_type !== 'none'

  return (
    <div style={s.page}>
      <h1 style={s.h1}>{isEdit ? 'Editar Job' : 'Novo Job'}</h1>
      <form onSubmit={save}>

        {/* === GERAL === */}
        <div style={s.card}>
          <h2 style={s.h2}>Configuração Geral</h2>
          <div style={s.grid2}>
            <label style={s.label}>Nome do job
              <input style={s.input} value={form.name} onChange={f('name')} required />
            </label>
            <label style={s.label}>Tipo de origem
              <select style={s.input} value={form.source_type ?? 'db'} onChange={f('source_type')}>
                <option value="db">Banco de dados (SQL)</option>
                <option value="api">API (REST / GraphQL)</option>
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

        {/* === BANCO DE DADOS === */}
        {!isApi && (
          <div style={s.card}>
            <h2 style={s.h2}>Origem — Banco de Dados</h2>
            <div style={s.grid2}>
              <label style={{ ...s.label, gridColumn: '1 / -1' }}>Conexão de origem
                <select style={s.input} value={form.connection_id ?? 0} onChange={f('connection_id')} required>
                  <option value="">Selecione...</option>
                  {connections.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
                </select>
              </label>
            </div>
            <p style={{ color: '#64748b', fontSize: 13, margin: '16px 0 8px' }}>
              Variáveis disponíveis:{' '}
              <code style={s.code}>&#123;&#123;data_inicio&#125;&#125;</code>{' '}
              <code style={s.code}>&#123;&#123;data_fim&#125;&#125;</code>{' '}
              <code style={s.code}>&#123;&#123;schema&#125;&#125;</code>{' '}
              <code style={s.code}>&#123;&#123;loja&#125;&#125;</code>
              <span style={{ marginLeft: 8, color: '#475569' }}>
                → lista SQL: <code style={{ ...s.code, color: '#94a3b8' }}>'001', '002', '003'</code>
              </span>
            </p>
            <textarea style={{ ...s.textarea, minHeight: 220 }} value={form.sql_template} onChange={f('sql_template')} required />
          </div>
        )}

        {/* === API === */}
        {isApi && (
          <div style={s.card}>
            <h2 style={s.h2}>Origem — API</h2>
            <div style={s.grid2}>
              <label style={{ ...s.label, gridColumn: '1 / -1' }}>Conexão API
                <select style={s.input} value={form.api_connection_id ?? 0} onChange={f('api_connection_id')} required>
                  <option value="">Selecione...</option>
                  {apiConns.map(c => <option key={c.id} value={c.id}>{c.name} ({c.base_url})</option>)}
                </select>
                {apiConns.length === 0 && (
                  <span style={{ color: '#f59e0b', fontSize: 12 }}>
                    Nenhuma conexão API cadastrada.{' '}
                    <a href="/api-connections" style={{ color: '#818cf8' }}>Criar agora</a>
                  </span>
                )}
              </label>

              <label style={s.label}>Endpoint
                <input style={s.input} value={form.api_endpoint ?? ''} onChange={f('api_endpoint')}
                  placeholder="/sales?from={{data_inicio}}&to={{data_fim}}" required />
              </label>
              <label style={s.label}>Método HTTP
                <select style={s.input} value={form.api_method ?? 'GET'} onChange={f('api_method')}>
                  <option value="GET">GET</option>
                  <option value="POST">POST (body abaixo)</option>
                  <option value="PUT">PUT (body abaixo)</option>
                </select>
              </label>

              <label style={s.label}>Caminho dos dados na resposta
                <input style={s.input} value={form.api_data_path ?? ''} onChange={f('api_data_path')}
                  placeholder="data.items  ou  results  (vazio = raiz)" />
              </label>
              <label style={s.label}>Tipo de paginação
                <select style={s.input} value={form.api_pagination_type ?? 'none'} onChange={f('api_pagination_type')}>
                  <option value="none">Nenhuma (única requisição)</option>
                  <option value="page">Por página (?page=1,2,3...)</option>
                  <option value="offset">Por offset (?offset=0,100,200...)</option>
                  <option value="cursor">Por cursor (token na resposta)</option>
                </select>
              </label>

              {showPagination && (
                <>
                  <label style={s.label}>Parâmetro da página/cursor
                    <input style={s.input} value={form.api_page_param ?? 'page'} onChange={f('api_page_param')} placeholder="page" />
                  </label>
                  <label style={s.label}>Tamanho da página (registros)
                    <input style={s.input} type="number" min={1} value={form.api_page_size ?? 100} onChange={f('api_page_size')} />
                  </label>
                </>
              )}

              {form.api_pagination_type === 'cursor' && (
                <label style={{ ...s.label, gridColumn: '1 / -1' }}>Caminho do próximo cursor na resposta
                  <input style={s.input} value={form.api_next_path ?? ''} onChange={f('api_next_path')}
                    placeholder="meta.next_cursor  ou  pagination.after" />
                </label>
              )}

              <label style={{ ...s.label, gridColumn: '1 / -1' }}>
                Config avançada (JSON opcional)
                <span style={{ color: '#475569', fontSize: 11 }}>
                  Exemplos: {`{"graphql": true}`} · {`{"page_size_param": "per_page"}`} · {`{"first_page": 0}`} · {`{"offset_param": "skip", "limit_param": "take"}`}
                </span>
                <textarea style={{ ...s.textarea, minHeight: 60, fontFamily: 'monospace' }}
                  value={form.api_config ?? ''} onChange={f('api_config')}
                  placeholder='{"graphql": true, "variables": {"store": "001"}}' />
              </label>

              {needsBody && (
                <>
                  <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #2d3149', paddingTop: 16 }}>
                    <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 8px' }}>
                      {form.api_config?.includes('"graphql"') ? 'GraphQL Query' : 'Body Template (JSON)'} —{' '}
                      variáveis: <code style={s.code}>&#123;&#123;data_inicio&#125;&#125;</code>{' '}
                      <code style={s.code}>&#123;&#123;data_fim&#125;&#125;</code>{' '}
                      <code style={s.code}>&#123;&#123;schema&#125;&#125;</code>{' '}
                      <code style={s.code}>&#123;&#123;loja&#125;&#125;</code>
                    </p>
                    <textarea style={{ ...s.textarea, minHeight: 160 }}
                      value={form.sql_template} onChange={f('sql_template')}
                      placeholder={form.api_config?.includes('"graphql"')
                        ? 'query { vendas(from: "{{data_inicio}}", to: "{{data_fim}}") { id valor } }'
                        : '{"from": "{{data_inicio}}", "to": "{{data_fim}}"}'}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* === MAPEAMENTO DE CAMPOS === */}
        <div style={s.card}>
          <h2 style={s.h2}>Mapeamento de Campos (opcional)</h2>
          <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 16px' }}>
            Transforma cada linha de dados <strong style={{ color: '#94a3b8' }}>antes</strong> de gravar no PostgreSQL.
            As transformações são aplicadas nesta ordem: <code style={s.code}>select</code> → <code style={s.code}>rename</code> → <code style={s.code}>cast</code> → <code style={s.code}>fixed</code> → <code style={s.code}>concat</code> → <code style={s.code}>explode</code>.
          </p>

          {/* Tabela de referência rápida */}
          <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
            {[
              {
                key: 'select',
                cor: '#3b82f6',
                titulo: 'Selecionar campos',
                desc: 'Lista quais campos da origem você quer manter. Campos fora da lista são descartados. Se omitir, todos os campos passam.',
                exemplo: '"select": ["id_pedido", "valor", "data_emissao"]',
              },
              {
                key: 'rename',
                cor: '#8b5cf6',
                titulo: 'Renomear colunas',
                desc: 'Muda o nome de uma coluna da origem para outro nome no destino. Formato: "nome_origem": "nome_destino".',
                exemplo: '"rename": { "id_pedido": "pedido_id", "valor_bruto": "valor" }',
              },
              {
                key: 'cast',
                cor: '#f59e0b',
                titulo: 'Converter tipo',
                desc: 'Converte o valor de um campo para outro tipo. Tipos disponíveis: number (decimal), integer (inteiro), date (data ISO), boolean (true/false), string (texto), json (faz parse de uma string JSON).',
                exemplo: '"cast": { "valor": "number", "data_emissao": "date", "ativo": "boolean" }',
              },
              {
                key: 'fixed',
                cor: '#10b981',
                titulo: 'Colunas fixas',
                desc: 'Adiciona colunas com valor constante em todas as linhas — mesmo que não existam na origem. Útil para marcar de qual sistema ou loja veio o dado.',
                exemplo: '"fixed": { "sistema": "ERP", "pais": "BR", "loja": "lojaB" }',
              },
              {
                key: 'concat',
                cor: '#ef4444',
                titulo: 'Concatenar campos',
                desc: 'Cria uma coluna nova combinando texto fixo com valores de outros campos. Use {{campo}} para referenciar o valor de um campo. Campos inexistentes viram string vazia.',
                exemplo: '"concat": { "codigo_completo": "lojaB_{{codigo}}", "chave": "{{ano}}-{{mes}}-{{id}}" }',
              },
              ...(isApi ? [{
                key: 'explode',
                cor: '#06b6d4',
                titulo: 'Normalizar array aninhado (só API)',
                desc: 'Quando a API retorna objetos com um campo que é um array, "explode" cada item do array em uma linha separada — herdando os campos do objeto pai. Informe apenas o nome do campo array.',
                exemplo: '"explode": "itens"   →   { pedido_id: 1, itens: [{sku:"A"}, {sku:"B"}] }  vira 2 linhas',
              }] : []),
            ].map(({ key, cor, titulo, desc, exemplo }) => (
              <div key={key} style={{ borderLeft: `3px solid ${cor}`, paddingLeft: 12, paddingTop: 4, paddingBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <code style={{ ...s.code, color: cor, fontWeight: 700 }}>{key}</code>
                  <span style={{ color: '#cbd5e1', fontSize: 13, fontWeight: 600 }}>{titulo}</span>
                </div>
                <p style={{ color: '#94a3b8', fontSize: 12, margin: '0 0 4px' }}>{desc}</p>
                <code style={{ color: '#64748b', fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{exemplo}</code>
              </div>
            ))}
          </div>

          <label style={s.label}>
            Configuração JSON do mapeamento
            <textarea
              style={{ ...s.textarea, minHeight: 130, fontFamily: 'monospace', fontSize: 12 }}
              value={form.field_mapping ?? ''}
              onChange={f('field_mapping')}
              placeholder={isApi
                ? `{
  "select": ["pedido_id", "sku", "quantidade", "preco"],
  "rename": { "pedido_id": "id_pedido" },
  "cast":   { "quantidade": "integer", "preco": "number" },
  "fixed":  { "sistema": "API", "loja": "lojaB" },
  "concat": { "codigo_loja": "lojaB_{{sku}}" },
  "explode": "itens"
}`
                : `{
  "select": ["id_pedido", "valor_bruto", "dt_emissao"],
  "rename": { "id_pedido": "pedido_id", "valor_bruto": "valor" },
  "cast":   { "valor": "number", "dt_emissao": "date" },
  "fixed":  { "sistema": "ERP", "pais": "BR" },
  "concat": { "codigo_completo": "lojaB_{{codigo}}" }
}`}
            />
          </label>

          {/* Script JS */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #2d3149' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
              <h3 style={{ margin: 0, fontSize: 14, color: '#e2e8f0' }}>Script de Transformação JS</h3>
              <span style={{ fontSize: 12, color: '#64748b' }}>opcional — executado após o mapeamento JSON acima</span>
            </div>
            <p style={{ color: '#94a3b8', fontSize: 12, margin: '0 0 8px' }}>
              Escreva código JavaScript livre para transformar os dados. A variável <code style={s.code}>rows</code> é um array de objetos e o script deve <strong style={{ color: '#94a3b8' }}>retornar</strong> o array transformado.
              Permite adicionar campos calculados, filtrar linhas, combinar valores, etc.
              Executado em ambiente isolado (sem acesso a rede, arquivos ou bibliotecas externas).
            </p>
            <div style={{ background: '#0f1629', border: '1px solid #2d3149', borderRadius: 6, padding: '8px 12px', marginBottom: 8 }}>
              <p style={{ color: '#475569', fontSize: 11, margin: '0 0 4px', fontFamily: 'monospace' }}>// Exemplos:</p>
              <p style={{ color: '#475569', fontSize: 11, margin: '0 0 4px', fontFamily: 'monospace' }}>{'return rows.map(row => ({ ...row, margem: row.preco - row.custo }))'}</p>
              <p style={{ color: '#475569', fontSize: 11, margin: '0 0 4px', fontFamily: 'monospace' }}>{'return rows.filter(row => row.valor > 0)'}</p>
              <p style={{ color: '#475569', fontSize: 11, margin: 0, fontFamily: 'monospace' }}>{'return rows.map(row => ({ ...row, codigo_loja: "lojaB_" + row.codigo }))'}</p>
            </div>
            <textarea
              style={{ ...s.textarea, minHeight: 100, fontFamily: 'monospace', fontSize: 12 }}
              value={form.transform_script ?? ''}
              onChange={f('transform_script')}
              placeholder={'return rows.map(row => ({\n  ...row,\n  margem: row.preco - row.custo,\n  codigo_loja: "lojaB_" + row.codigo\n}))'}
            />
          </div>
        </div>

        {/* === WEBHOOK === */}
        <div style={s.card}>
          <h2 style={s.h2}>Webhook (opcional)</h2>
          <p style={{ color: '#64748b', fontSize: 13, marginBottom: 12 }}>
            Após cada execução (sucesso, falha ou parada), envia um POST com o resultado para a URL configurada.
          </p>
          <label style={s.label}>URL do Webhook
            <input style={s.input} value={form.webhook_url ?? ''} onChange={f('webhook_url')}
              placeholder="https://hooks.exemplo.com/integrador" />
          </label>
        </div>

        {/* === AGENDAMENTO === */}
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
