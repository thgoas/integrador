# Integrador — ETL Manager

Aplicação para gerenciar jobs de ETL: extrai dados de bancos SQL ou APIs REST/GraphQL de origem, processa em janelas de período e grava no PostgreSQL de destino (alimenta Power BI). Também expõe os dados gravados via API de leitura.

## Como rodar

```bash
# Backend (porta 3000)
cd backend && npm run dev

# Frontend (porta 5173)
cd frontend && npm run dev
```

Acesse: http://localhost:5173  
Login padrão: `admin` / `admin123`

> **Node 25+**: `tsx/esm` tem incompatibilidade com `pino-pretty` no Node 25. Use `npm run build && node --experimental-sqlite --env-file=.env dist/index.js` para rodar o backend compilado.

### Índices no PostgreSQL de destino

Para acelerar as consultas agregadas por (data, loja/empresa) — backfill do Painel:

```bash
cd backend && npm run build && npm run indexes
```

Cria `CREATE INDEX CONCURRENTLY IF NOT EXISTS` em `vendas (dtvenda, empresa, loja)`,
`estoques (data, loja)` e `cadastros (data_venda, empresa, loja)`. Idempotente; pula
tabelas/colunas inexistentes. Fonte: [`src/scripts/create-indexes.ts`](backend/src/scripts/create-indexes.ts).

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Node.js 22+ + TypeScript + Fastify 4 |
| Banco local | SQLite via `node:sqlite` (built-in Node 22) |
| Frontend | React + Vite + TypeScript |
| Origem DB | `mssql` / `mysql2` / `pg` + `pg-query-stream` |
| Origem API | `fetch` nativo (Node 22+) |
| Destino | `pg` + `pg-copy-streams` (protocolo COPY) |
| Paralelismo | `p-limit` |
| Auth | JWT via `@fastify/jwt` v8 (v8, não v10 — requer Fastify 4) |
| Criptografia | AES-256-CBC para senhas/tokens das conexões |
| Datas | `date-fns` |

## Estrutura

```
backend/src/
  api/
    server.ts               # Fastify + plugins + auth hook global
    routes/
      auth.ts               # POST /auth/login, GET /auth/me
      connections.ts        # CRUD conexões DB + POST /test
      api-connections.ts    # CRUD conexões API + POST /test
      jobs.ts               # CRUD jobs + start/stop/reprocess
      runs.ts               # GET runs + polling de logs
      data.ts               # GET /data (lista tabelas), GET /data/:table/columns, GET /data/:table (filtros dinâmicos), POST /data/:table
      tokens.ts             # CRUD tokens de API — POST/GET/DELETE /auth/tokens
    sse.ts                  # broadcast SSE (mantido, sem subscribers ativos)
  db/
    sqlite.ts               # Singleton DatabaseSync + runMigrations()
    schema.sql              # DDL das tabelas SQLite
    crypto.ts               # encrypt/decrypt AES para senhas
  etl/
    runner.ts               # Orquestra pipeline: p-limit + AbortController + webhook
    template.ts             # Substitui {{variavel}} no SQL/endpoint
    periods.ts              # Gera janelas day/week/month
    extractor.ts            # Stream chunked por tipo de DB
    api-extractor.ts        # Extração via HTTP: REST paginado, cursor, offset, GraphQL
    loader.ts               # ensureTable, upsertChunkToTable, copyChunkToTable, deletePeriod
    transform.ts            # applyMapping(rows, config): select, rename, cast, fixed
  scheduler/
    cron.ts                 # Avalia jobs a cada minuto (cron + reprocessamento mensal)
  config/
    env.ts                  # Zod: valida variáveis de ambiente
    destination.ts          # Pool pg para o PostgreSQL destino

frontend/src/
  api/
    http.ts                 # fetch wrapper + getToken/setToken/clearToken
    types.ts                # Interfaces: Connection, ApiConnection, Job, Run, RunLog, ApiToken
    index.ts                # api.auth.*, api.jobs.*, api.connections.*, api.apiConnections.*, api.runs.*, api.data.*, api.tokens.*
  components/
    StatusBadge.tsx
    RunLogViewer.tsx        # Polling a cada 2s enquanto run está ativo
  pages/
    Login.tsx
    Dashboard.tsx
    Jobs.tsx
    JobForm.tsx             # Criar/editar job (suporta source_type: db | api)
    JobDetail.tsx           # Logs em tempo real + histórico de runs
    Connections.tsx         # Conexões de banco de dados
    ApiConnections.tsx      # Conexões de API (REST/GraphQL)
    ApiTokens.tsx           # Gerenciamento de tokens de API (criar, listar, revogar)
  styles.ts                 # Objeto `s` com estilos inline centralizados
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

Tabelas: `connections`, `api_connections`, `jobs`, `runs`, `run_logs`, `users`, `api_tokens`.

Colunas adicionadas via migration incremental (try/catch em ALTER TABLE):
- `jobs.date_column` — coluna no destino usada para DELETE por período
- `jobs.code_column` — coluna única para upsert (ON CONFLICT DO UPDATE)
- `jobs.source_type` — `'db'` (padrão) ou `'api'`
- `jobs.api_connection_id` — FK para `api_connections`
- `jobs.api_endpoint` — template de endpoint, ex: `/sales?from={{data_inicio}}&to={{data_fim}}`
- `jobs.api_method` — `GET`, `POST`, `PUT` etc.
- `jobs.api_data_path` — caminho dot-notation para o array na resposta, ex: `data.items`
- `jobs.api_pagination_type` — `none` / `page` / `offset` / `cursor`
- `jobs.api_page_param` — nome do parâmetro de página/cursor
- `jobs.api_page_size` — tamanho da página
- `jobs.api_next_path` — dot-notation para o próximo cursor na resposta
- `jobs.api_config` — JSON livre para overrides avançados (ver abaixo)
- `jobs.webhook_url` — URL chamada via POST após cada run
- `jobs.field_mapping` — JSON com config de transformação de campos (ver abaixo)

## Fluxo ETL

```
POST /api/jobs/:id/start
  ├── Cria run (status: running)
  ├── Gera janelas de período (day/week/month)
  └── p-limit(concurrency): para cada janela em paralelo
        ├── renderTemplate → substitui {{data_inicio}}, {{data_fim}}, {{loja}}, {{schema}}
        ├── Se source_type='db':  extractChunked (stream SQL)
        │   Se source_type='api': extractApiChunked (HTTP paginado)
        ├── Primeiro chunk: ensureTable + syncColumns (unique index se code_column)
        ├── Se code_column → upsertChunkToTable (staging COPY + ON CONFLICT DO UPDATE)
        └── Senão → deletePeriod + copyChunkToTable (DELETE + COPY direto)
  └── Após finalizar: chama webhook_url se configurado
```

## Estratégias de deduplicação

| Configuração | Estratégia |
|---|---|
| `code_column` preenchida | Upsert: INSERT ON CONFLICT DO UPDATE |
| Só `date_column` | DELETE período + INSERT direto |
| Nenhuma | INSERT puro (pode duplicar em re-runs) |

## Template SQL / Endpoint

Variáveis disponíveis em `sql_template` (DB) e `api_endpoint` (API):
`{{data_inicio}}`, `{{data_fim}}`, `{{schema}}`, `{{loja}}`

`{{loja}}` aceita vírgulas (`001,002,003`) e renderiza como lista SQL `'001', '002', '003'` — use com `IN ({{loja}})`.

Para jobs API com método POST, o `sql_template` é o body da requisição (JSON ou GraphQL query).

## Conexões API (`api_connections`)

| Campo | Descrição |
|---|---|
| `base_url` | URL base, ex: `https://api.exemplo.com/v1` |
| `auth_type` | `none` / `bearer` / `apikey` / `basic` |
| `auth_header` | Nome do header para `apikey`, ex: `X-API-Key` |
| `auth_value` | Token/senha — armazenado criptografado (AES-256-CBC) |
| `headers` | JSON com headers extras opcionais |

## Config avançada de API (`api_config` — JSON)

| Chave | Efeito |
|---|---|
| `"graphql": true` | Encapsula o body em `{"query": "...", "variables": {...}}` |
| `"variables": {...}` | Variáveis extras para GraphQL |
| `"page_size_param": "per_page"` | Nome do parâmetro de tamanho de página (padrão: `limit`) |
| `"first_page": 0` | Primeira página (padrão: `1`) |
| `"offset_param": "skip"` | Nome do parâmetro de offset (padrão: `offset`) |
| `"limit_param": "take"` | Nome do parâmetro de limite para offset (padrão: `limit`) |

## API de leitura dos dados

```
GET /api/data
→ { tables: [{ name, row_estimate }] }

GET /api/data/:table/columns
→ { table, columns: [{ name, type, position, nullable }] }

GET /api/data/:table?limit=100&offset=0&order_by=col&order_dir=asc|desc&[filtros]&[agregação]
→ { data: [...], total: N, limit: N, offset: N }
```

Lê do PostgreSQL destino. Requer JWT **ou token de API** (`itg_...`). Limite máximo: 10.000 linhas.

### Filtros dinâmicos em GET /api/data/:table

| Sufixo | Operador | Exemplo |
|--------|----------|---------|
| `col=valor` | `=` | `?status=ativo` |
| `col__gt=valor` | `>` | `?valor__gt=1000` |
| `col__gte=valor` | `>=` | `?data__gte=2024-01-01` |
| `col__lt=valor` | `<` | `?data__lt=2024-12-31` |
| `col__lte=valor` | `<=` | `?preco__lte=500` |
| `col__like=valor` | `ILIKE` | `?nome__like=João%` |
| `col__in=v1,v2` | `= ANY(...)` | `?status__in=ativo,inativo` |
| `col__null=true` | `IS NULL` | `?obs__null=true` |

### Agregação em GET /api/data/:table

Quando `group_by` ou qualquer função de agregação está presente, o endpoint entra em modo de agregação (equivalente a `SELECT … GROUP BY …` no PostgreSQL). Funciona em qualquer tabela sem configuração prévia.

| Parâmetro | Efeito | Exemplo |
|-----------|--------|---------|
| `group_by=col1,col2` | `GROUP BY "col1", "col2"` | `?group_by=loja,mes` |
| `sum=col1,col2` | `SUM("col")` → alias `sum_col` | `?sum=valor,qtd` |
| `avg=col` | `AVG("col")` → alias `avg_col` | `?avg=preco` |
| `count=*` | `COUNT(*)` → alias `count` | `?count=*` |
| `count=col` | `COUNT("col")` → alias `count_col` | `?count=id` |
| `count_distinct=col` | `COUNT(DISTINCT "col")` → alias `count_distinct_col` | `?count_distinct=venda` |
| `min=col` | `MIN("col")` → alias `min_col` | `?min=data` |
| `max=col` | `MAX("col")` → alias `max_col` | `?max=data` |

- Filtros dinâmicos continuam funcionando (viram `WHERE` antes do `GROUP BY`)
- `order_by` pode referenciar colunas do grupo ou aliases gerados (`sum_valor`, `count`, etc.)
- `total` retorna o número de grupos distintos, não de linhas brutas
- `limit`/`offset` paginam os grupos normalmente
- Referência completa: [`docs/api-data-endpoint.md`](docs/api-data-endpoint.md)

## Tokens de API

Tokens de longa duração para integrar Power BI e sistemas externos sem precisar de login periódico.

```
POST /api/auth/tokens   { name }    → { id, name, token: "itg_<64hex>" }   (token exibido só uma vez)
GET  /api/auth/tokens               → [{ id, name, last_used_at, created_at }]
DELETE /api/auth/tokens/:id         → { ok: true }
```

- **Formato:** `itg_<64 hex chars>` — armazenado como hash SHA-256 (valor bruto nunca persiste)
- **Escopo restrito:** apenas `GET /api/data/*` — qualquer outra rota retorna 403
- **Sem expiração** — válido até revogação manual
- **Uso:** `Authorization: Bearer itg_<valor>`
- `last_used_at` atualizado a cada requisição autenticada via token

## Mapeamento de campos (`field_mapping` — JSON)

Transforma os dados antes de gravar no PostgreSQL destino. Aplicado em cada chunk do ETL e no `POST /api/data/:table` (via campo `mapping` no body).

```json
{
  "select": ["id_pedido", "valor_bruto", "dt_emissao"],
  "rename": { "id_pedido": "pedido_id", "valor_bruto": "valor" },
  "cast":   { "valor": "number", "dt_emissao": "date" },
  "fixed":  { "sistema": "ERP", "pais": "BR" }
}
```

| Chave | Efeito |
|-------|--------|
| `select` | Whitelist de campos da origem; omitir = todos |
| `rename` | `campo_origem → coluna_destino` |
| `cast` | Converte tipo: `number`, `integer`, `date`, `boolean`, `string`, `json` |
| `types` | Define o tipo da **coluna** no destino (DDL), não transforma o valor |
| `fixed` | Adiciona campo com valor fixo a todas as linhas |

Ordem de aplicação: **select → rename → cast → fixed → concat → explode**

### Tipo da coluna no destino (`types`)

Por padrão a tabela destino é auto-criada com tipos inferidos do primeiro chunk —
qualquer valor numérico vira `NUMERIC`/`BIGINT`. Para forçar o tipo (ex: códigos
como EAN, CNPJ, IDs com zero à esquerda que devem ser **texto**), use `types`:

```json
{ "types": { "codigo": "text", "ean": "text" } }
```

| Tipo amigável | Coluna PostgreSQL |
|---|---|
| `text` / `string` | `TEXT` |
| `bigint` / `integer` / `int` | `BIGINT` |
| `numeric` / `number` / `decimal` | `NUMERIC` |
| `float` | `DOUBLE PRECISION` |
| `boolean` / `bool` | `BOOLEAN` |
| `date` | `DATE` |
| `timestamp` / `timestamptz` | `TIMESTAMPTZ` |

- O `cast` também influencia o tipo da coluna: `cast: "string"` agora gera coluna
  `TEXT` (antes o valor virava string mas a coluna ainda nascia `NUMERIC`). `types`
  tem prioridade sobre o derivado do `cast`.
- Chaves usam o nome de **destino** da coluna (pós-`rename`), igual a `cast`/`fixed`.
- Em tabela/coluna **já existente** com tipo divergente, roda
  `ALTER COLUMN ... TYPE ... USING ...` (best-effort): `NUMERIC → TEXT` é seguro;
  conversões inválidas (ex: `TEXT → NUMERIC` com dados não-numéricos) falham e só
  geram aviso nos logs do run, sem interromper o fluxo.

### POST /api/data/:table com mapeamento

```json
{
  "rows": [{ "campo_a": "42", "campo_b": "2024-01-01" }],
  "mapping": {
    "rename": { "campo_a": "id", "campo_b": "data" },
    "cast":   { "id": "integer", "data": "date" }
  }
}
```

Formato antigo (array direto) continua funcionando sem mudanças.

## Reprocessamento de janelas que falharam

Cada janela (período) roda isolada; se uma falha (ex.: deadlock), o erro é capturado,
as demais continuam e o run termina com status **`failed`**. As janelas falhas ficam
persistidas em `runs.failed_periods` (JSON `[{ "from", "to" }]`).

```
POST /api/jobs/:id/reprocess-failed   { run_id }
→ { ok: true, run_id, periods: N }   # reroda só as janelas que falharam naquele run
```

- Lê `runs.failed_periods` do run informado e reprocessa exatamente aquelas janelas
  (via override interno `_periods_override` no runner, sem regerar todo o intervalo).
- Se o run não tiver janelas falhas, retorna 400.
- Útil para deadlocks: depois de baixar `concurrency` para 1, reprocessar só os meses
  que travaram em vez do range inteiro.

## Webhook pós-execução

Se `webhook_url` estiver configurado no job, após cada run o backend faz:
```
POST <webhook_url>
Content-Type: application/json

{ job_id, job_name, run_id, status, rows_read, rows_written, started_at, finished_at }
```
Timeout de 10s. Falhas são registradas nos logs do run (nível `warn`), não interrompem o fluxo.

## Decisões técnicas importantes

- **`node:sqlite`** em vez de `better-sqlite3` — better-sqlite3 falha no Node 25 por compilação nativa
- **`@fastify/jwt` v8** — v10 requer Fastify 5; projeto usa Fastify 4
- **Polling (2s) em vez de SSE** — EventSource do browser não suporta headers customizados, impossível enviar JWT
- **COPY direto ao destino** — staging table removida; mais simples pois não há unique key universal
- **Upsert via temp table** — COPY para `_stg_<tabela>` na mesma transação, depois INSERT ON CONFLICT
- **Content-Type condicional** — header `application/json` só enviado quando há body (corrige FST_ERR_CTP_EMPTY_JSON_BODY em DELETE)
- **Senhas/tokens criptografados** — AES-256-CBC com ENCRYPT_KEY do .env (tanto conexões DB quanto API)
- **Tabela destino auto-criada** — tipos inferidos do primeiro chunk (`Date` → TIMESTAMPTZ, int → BIGINT, etc.)
- **`fetch` nativo para APIs** — Node 22+ tem fetch global; sem dependência externa para o extrator de API
- **`api_connections` tabela separada** — evita alterar CHECK constraint da tabela `connections` no SQLite
- **Tokens de API com hash SHA-256** — valor bruto nunca persiste; escopo restrito a GET /api/data/* para segurança
- **Filtros dinâmicos via query string** — operadores sufixados (`__gt`, `__like`, `__in` etc.) com whitelist fixa, valores sempre parametrizados

## Agendamento

O scheduler avalia a cada 60s:
- `schedule_enabled=1` + `schedule_cron` → executa mês atual (date_from=início do mês, date_to=hoje)
- `monthly_reprocess=1` → no dia 1 às 01:00, reprocessa o mês anterior completo
- `POST /api/jobs/:id/reprocess` → re-run manual com date_from/date_to livres
