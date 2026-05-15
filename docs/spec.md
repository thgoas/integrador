# Especificação Técnica — Integrador ETL

## Objetivo

Plataforma interna para gerenciar jobs de extração e carga de dados:
- Extrai de bancos SQL de origem (SQL Server, MySQL, PostgreSQL)
- Processa em janelas de período paralelas
- Grava no PostgreSQL de destino para consumo pelo Power BI
- Gerencia agendamentos e reprocessamentos via interface web

---

## Entidades

### Connection
Armazena credenciais de bancos de origem. Senha criptografada em AES-256-CBC.

| Campo | Tipo | Descrição |
|---|---|---|
| id | INTEGER | PK |
| name | TEXT | Nome amigável |
| type | TEXT | `mssql` \| `mysql` \| `postgres` |
| host | TEXT | Hostname/IP |
| port | INTEGER | Porta (null = padrão do tipo) |
| database | TEXT | Nome do banco |
| username | TEXT | Usuário |
| password | TEXT | Senha criptografada (AES-256-CBC) |

### Job
Define um pipeline de extração completo.

| Campo | Tipo | Descrição |
|---|---|---|
| id | INTEGER | PK |
| name | TEXT | Nome do job |
| connection_id | INTEGER | FK → connections |
| sql_template | TEXT | Query com variáveis `{{...}}` |
| destination_table | TEXT | Nome da tabela no PostgreSQL destino |
| schema | TEXT | Valor de `{{schema}}` |
| loja | TEXT | Valor de `{{loja}}` (aceita vírgulas) |
| date_column | TEXT | Coluna de data no destino para DELETE por período |
| code_column | TEXT | Coluna código única para upsert |
| date_mode | TEXT | `fixed` \| `current_month` \| `last_month` — determina como as datas são resolvidas na execução |
| date_from | DATE | Início do período (usado apenas quando `date_mode = fixed`) |
| date_to | DATE | Fim do período (usado apenas quando `date_mode = fixed`) |
| window_size | TEXT | `day` \| `week` \| `month` |
| concurrency | INTEGER | Janelas paralelas simultâneas |
| chunk_size | INTEGER | Linhas por chunk de extração |
| status | TEXT | `idle` \| `running` \| `stopped` |
| schedule_enabled | INTEGER | 0/1 — agendamento ativo |
| schedule_cron | TEXT | Expressão cron (ex: `0 */2 * * *`) |
| monthly_reprocess | INTEGER | 0/1 — refaz mês anterior no dia 1 |

### Run
Histórico de execuções de um job.

| Campo | Tipo | Descrição |
|---|---|---|
| id | INTEGER | PK |
| job_id | INTEGER | FK → jobs (CASCADE DELETE) |
| status | TEXT | `running` \| `success` \| `failed` \| `stopped` |
| rows_read | INTEGER | Total de linhas extraídas |
| rows_written | INTEGER | Total de linhas gravadas |
| error_msg | TEXT | Mensagem de erro (se falhou) |
| started_at | DATETIME | Início da execução |
| finished_at | DATETIME | Fim da execução |

### RunLog
Logs linha a linha de cada execução.

| Campo | Tipo | Descrição |
|---|---|---|
| id | INTEGER | PK |
| run_id | INTEGER | FK → runs (CASCADE DELETE) |
| level | TEXT | `info` \| `warn` \| `error` |
| message | TEXT | Mensagem do log |
| created_at | DATETIME | Timestamp do log |

---

## API REST

### Auth
| Method | Path | Auth | Descrição |
|---|---|---|---|
| POST | `/api/auth/login` | público | Retorna JWT |
| GET | `/api/auth/me` | JWT | Retorna usuário logado |

### Connections
| Method | Path | Descrição |
|---|---|---|
| GET | `/api/connections` | Lista todas |
| POST | `/api/connections` | Cria nova |
| PUT | `/api/connections/:id` | Edita |
| DELETE | `/api/connections/:id` | Remove |
| POST | `/api/connections/:id/test` | Testa conectividade |

### Jobs
| Method | Path | Descrição |
|---|---|---|
| GET | `/api/jobs` | Lista com status e último run |
| GET | `/api/jobs/:id` | Detalhes |
| POST | `/api/jobs` | Cria |
| PUT | `/api/jobs/:id` | Edita |
| DELETE | `/api/jobs/:id` | Remove (cascata nos runs) |
| POST | `/api/jobs/:id/start` | Inicia run |
| POST | `/api/jobs/:id/stop` | Para run em andamento |
| POST | `/api/jobs/:id/reprocess` | Re-run com `date_from`/`date_to` customizados |

### Runs / Logs
| Method | Path | Descrição |
|---|---|---|
| GET | `/api/jobs/:id/runs` | Histórico de runs (últimos 50) |
| GET | `/api/runs/:id` | Detalhes de um run |
| GET | `/api/runs/:id/logs?after=N` | Logs desde o id N (polling 2s) |

### Dados
| Method | Path | Descrição |
|---|---|---|
| POST | `/api/data/:table` | Inserção manual de linha(s) no destino |

---

## Pipeline ETL

### Template SQL
Variáveis substituídas antes da execução:

| Variável | Valor |
|---|---|
| `{{data_inicio}}` | Data de início da janela (YYYY-MM-DD) |
| `{{data_fim}}` | Data de fim da janela (YYYY-MM-DD) |
| `{{schema}}` | Campo `schema` do job |
| `{{loja}}` | Campo `loja` do job — renderizado como `'001', '002'` |

`{{loja}}` sempre converte vírgulas para lista SQL segura (escapa aspas simples).

### Janelas de período
Dado `date_from`, `date_to` e `window_size`, gera períodos não sobrepostos:
- `day` → 1 janela por dia
- `week` → 1 janela por semana (segunda a domingo)
- `month` → 1 janela por mês

### Extração
- **MSSQL**: `mssql` com `request.stream = true`, queue event-based
- **MySQL**: `mysql2/promise` com `execute` (carrega tudo em memória, depois chunka)
- **PostgreSQL**: `pg` + `pg-query-stream` com `batchSize`

### Carga

#### Modo Upsert (code_column configurada)
1. COPY para tabela temporária `_stg_<destino>` na mesma transação
2. `INSERT INTO destino SELECT * FROM staging ON CONFLICT (code_column) DO UPDATE SET ...`
3. Unique index criado automaticamente no `ensureTable`

#### Modo DELETE + INSERT (date_column configurada, sem code_column)
1. `DELETE WHERE date_column::date BETWEEN date_from AND date_to`
2. COPY direto para a tabela destino via `pg-copy-streams`

#### Modo INSERT puro (nenhuma coluna configurada)
COPY direto, sem deduplicação. Pode duplicar em re-runs.

### Criação automática da tabela destino
No primeiro chunk, `ensureTable` inspeciona os valores e infere tipos PostgreSQL:

| Valor JS | Tipo PostgreSQL |
|---|---|
| `Date` | `TIMESTAMPTZ` |
| Integer | `BIGINT` |
| Float | `NUMERIC` |
| Boolean | `BOOLEAN` |
| `YYYY-MM-DD` | `DATE` |
| `YYYY-MM-DDTHH:MM...` | `TIMESTAMPTZ` |
| Outros | `TEXT` |

`syncColumns` adiciona colunas novas com `ALTER TABLE ADD COLUMN IF NOT EXISTS`.

### Serialização para COPY CSV
- `null` / `undefined` → `\N` (NULL no PostgreSQL)
- `Date` → `.toISOString()` (evita representação locale do Node)
- Strings com `,`, `"`, `\n` → envolvidas em aspas duplas com escape

---

## Agendamento

O scheduler avalia a cada 60 segundos todos os jobs com `status = 'idle'`:

1. **Cron automático**: se `schedule_enabled=1` e o cron bate com o minuto atual → executa com `date_from=início do mês` e `date_to=hoje` (sobrescreve `date_mode`)
2. **Reprocessamento mensal**: se `monthly_reprocess=1` e é dia 1 às 01:00 → executa com o mês anterior completo (sobrescreve `date_mode`)
3. **Manual via botão Iniciar**: respeita o `date_mode` do job — `fixed` usa as datas salvas, `current_month` computa início do mês até hoje, `last_month` computa o mês anterior completo
4. **Reprocessar período**: `POST /api/jobs/:id/reprocess` com `date_from`/`date_to` livres no body (ignora `date_mode`)

O cron é implementado sem biblioteca externa — `matchCron()` suporta `*`, `*/N` e valores fixos.

---

## Segurança

- Todas as rotas exigem JWT no header `Authorization: Bearer <token>` (exceto `/api/auth/login` e `/api/health`)
- Token com 8h de validade
- Credenciais do usuário admin definidas em `.env` (`APP_USER`, `APP_PASSWORD`)
- Senhas das conexões criptografadas com AES-256-CBC usando `ENCRYPT_KEY` do `.env`
- Frontend: 401 → limpa token e redireciona para `/login`
