# Integrador — ETL Manager

Aplicação para gerenciar jobs de ETL: extrai dados de bancos SQL de origem (SQL Server, MySQL, PostgreSQL), processa em janelas de período e grava no PostgreSQL de destino (alimenta Power BI).

## Como rodar

```bash
# Backend (porta 3000)
cd backend && npm run dev

# Frontend (porta 5173)
cd frontend && npm run dev
```

Acesse: http://localhost:5173  
Login padrão: `admin` / `admin123`

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Node.js 22+ + TypeScript + Fastify 4 |
| Banco local | SQLite via `node:sqlite` (built-in Node 22) |
| Frontend | React + Vite + TypeScript |
| Origem | `mssql` / `mysql2` / `pg` + `pg-query-stream` |
| Destino | `pg` + `pg-copy-streams` (protocolo COPY) |
| Paralelismo | `p-limit` |
| Auth | JWT via `@fastify/jwt` v8 (v8, não v10 — requer Fastify 4) |
| Criptografia | AES-256-CBC para senhas das conexões |
| Datas | `date-fns` |

## Estrutura

```
backend/src/
  api/
    server.ts           # Fastify + plugins + auth hook global
    routes/
      auth.ts           # POST /auth/login, GET /auth/me
      connections.ts    # CRUD conexões + POST /test
      jobs.ts           # CRUD jobs + start/stop/reprocess
      runs.ts           # GET runs + polling de logs
      data.ts           # POST /data/:table (inserção manual)
    sse.ts              # broadcast SSE (mantido, sem subscribers ativos)
  db/
    sqlite.ts           # Singleton DatabaseSync + runMigrations()
    schema.sql          # DDL das 4 tabelas SQLite
    crypto.ts           # encrypt/decrypt AES para senhas
  etl/
    runner.ts           # Orquestra pipeline: p-limit + AbortController
    template.ts         # Substitui {{variavel}} no SQL
    periods.ts          # Gera janelas day/week/month
    extractor.ts        # Stream chunked por tipo de DB
    loader.ts           # ensureTable, upsertChunkToTable, copyChunkToTable, deletePeriod
  scheduler/
    cron.ts             # Avalia jobs a cada minuto (cron + reprocessamento mensal)
  config/
    env.ts              # Zod: valida variáveis de ambiente
    destination.ts      # Pool pg para o PostgreSQL destino

frontend/src/
  api/
    http.ts             # fetch wrapper + getToken/setToken/clearToken
    types.ts            # Interfaces: Connection, Job, Run, RunLog
    index.ts            # api.auth.*, api.jobs.*, api.connections.*, api.runs.*
  components/
    StatusBadge.tsx
    RunLogViewer.tsx    # Polling a cada 2s enquanto run está ativo
  pages/
    Login.tsx
    Dashboard.tsx
    Jobs.tsx
    JobForm.tsx         # Criar/editar job
    JobDetail.tsx       # Logs em tempo real + histórico de runs
    Connections.tsx
  styles.ts             # Objeto `s` com estilos inline centralizados
```

## Variáveis de ambiente (backend/.env)

```
PORT=3000
DEST_PG_HOST=localhost
DEST_PG_PORT=5432
DEST_PG_DATABASE=powerbi
DEST_PG_USER=postgres
DEST_PG_PASSWORD=<senha>
ENCRYPT_KEY=<32+ chars>
JWT_SECRET=<32+ chars>
APP_USER=admin
APP_PASSWORD=admin123
```

## Schema SQLite (banco local)

Tabelas: `connections`, `jobs`, `runs`, `run_logs`.

Colunas adicionadas via migration incremental (try/catch em ALTER TABLE):
- `jobs.date_column` — coluna no destino usada para DELETE por período
- `jobs.code_column` — coluna única para upsert (ON CONFLICT DO UPDATE)

## Fluxo ETL

```
POST /api/jobs/:id/start
  ├── Cria run (status: running)
  ├── Gera janelas de período (day/week/month)
  └── p-limit(concurrency): para cada janela em paralelo
        ├── renderTemplate → substitui {{data_inicio}}, {{data_fim}}, {{loja}}, {{schema}}
        ├── extractChunked → stream de chunks da origem
        ├── Primeiro chunk: ensureTable + syncColumns (unique index se code_column)
        ├── Se code_column → upsertChunkToTable (staging COPY + ON CONFLICT DO UPDATE)
        └── Senão → deletePeriod + copyChunkToTable (DELETE + COPY direto)
```

## Estratégias de deduplicação

| Configuração | Estratégia |
|---|---|
| `code_column` preenchida | Upsert: INSERT ON CONFLICT DO UPDATE |
| Só `date_column` | DELETE período + INSERT direto |
| Nenhuma | INSERT puro (pode duplicar em re-runs) |

## Template SQL

Variáveis disponíveis: `{{data_inicio}}`, `{{data_fim}}`, `{{schema}}`, `{{loja}}`

`{{loja}}` aceita vírgulas (`001,002,003`) e renderiza como lista SQL `'001', '002', '003'` — use com `IN ({{loja}})`.

## Decisões técnicas importantes

- **`node:sqlite`** em vez de `better-sqlite3` — better-sqlite3 falha no Node 25 por compilação nativa
- **`@fastify/jwt` v8** — v10 requer Fastify 5; projeto usa Fastify 4
- **Polling (2s) em vez de SSE** — EventSource do browser não suporta headers customizados, impossível enviar JWT
- **COPY direto ao destino** — staging table removida; mais simples pois não há unique key universal
- **Upsert via temp table** — COPY para `_stg_<tabela>` na mesma transação, depois INSERT ON CONFLICT
- **Content-Type condicional** — header `application/json` só enviado quando há body (corrige FST_ERR_CTP_EMPTY_JSON_BODY em DELETE)
- **Senhas criptografadas** — AES-256-CBC com ENCRYPT_KEY do .env
- **Tabela destino auto-criada** — tipos inferidos do primeiro chunk (`Date` → TIMESTAMPTZ, int → BIGINT, etc.)

## Agendamento

O scheduler avalia a cada 60s:
- `schedule_enabled=1` + `schedule_cron` → executa mês atual (date_from=início do mês, date_to=hoje)
- `monthly_reprocess=1` → no dia 1 às 01:00, reprocessa o mês anterior completo
- `POST /api/jobs/:id/reprocess` → re-run manual com date_from/date_to livres
