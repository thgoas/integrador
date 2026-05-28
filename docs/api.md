# API Reference — Integrador ETL Manager

Base URL: `http://localhost:3000/api`

Todas as rotas (exceto `/auth/login`) exigem autenticação via header:

```
Authorization: Bearer <token>
```

Dois tipos de token são aceitos:
- **JWT** — obtido via `POST /auth/login`, acesso completo
- **API Token** (`itg_...`) — criado via `POST /auth/tokens`, acesso restrito a `GET /api/data/*`

---

## Autenticação

### POST /auth/login

Autentica e retorna um JWT.

**Público** — não requer token.

**Request**
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Response `200`**
```json
{
  "token": "<jwt>",
  "username": "admin"
}
```

**Response `401`**
```json
{ "error": "Invalid credentials" }
```

---

### GET /auth/me

Retorna os dados do usuário autenticado.

**Response `200`**
```json
{
  "id": 1,
  "username": "admin"
}
```

---

### PUT /auth/password

Altera a senha do usuário autenticado.

**Request**
```json
{
  "current_password": "admin123",
  "new_password": "novasenha"
}
```

**Response `200`**
```json
{ "ok": true }
```

**Response `401`**
```json
{ "error": "Wrong password" }
```

---

## Tokens de API

Tokens de longa duração para integração com Power BI e sistemas externos. Escopo restrito a `GET /api/data/*`.

### POST /auth/tokens

Cria um novo token. O valor bruto é exibido **apenas uma vez**.

**Request**
```json
{ "name": "powerbi-prod" }
```

**Response `200`**
```json
{
  "id": 1,
  "name": "powerbi-prod",
  "token": "itg_a3f2c8..."
}
```

---

### GET /auth/tokens

Lista todos os tokens (sem o valor bruto).

**Response `200`**
```json
[
  {
    "id": 1,
    "name": "powerbi-prod",
    "last_used_at": "2024-06-01T10:00:00Z",
    "created_at": "2024-01-01T00:00:00Z"
  }
]
```

---

### DELETE /auth/tokens/:id

Revoga um token.

**Response `200`**
```json
{ "ok": true }
```

**Response `404`**
```json
{ "error": "Token not found" }
```

---

## Conexões de Banco de Dados

### GET /connections

Lista todas as conexões cadastradas. Senhas não são retornadas.

**Response `200`**
```json
[
  {
    "id": 1,
    "name": "ERP SQL Server",
    "type": "mssql",
    "host": "192.168.1.10",
    "port": 1433,
    "database": "erp",
    "username": "sa",
    "created_at": "2024-01-01T00:00:00Z"
  }
]
```

---

### POST /connections

Cria uma nova conexão.

**Request**
```json
{
  "name": "ERP SQL Server",
  "type": "mssql",
  "host": "192.168.1.10",
  "port": 1433,
  "database": "erp",
  "username": "sa",
  "password": "senha"
}
```

`type` aceita: `mssql`, `mysql`, `postgres`

**Response `200`**
```json
{ "id": 1 }
```

---

### PUT /connections/:id

Atualiza uma conexão existente. Todos os campos são opcionais.

**Request**
```json
{
  "host": "192.168.1.20",
  "password": "nova-senha"
}
```

**Response `200`**
```json
{ "ok": true }
```

---

### DELETE /connections/:id

Remove uma conexão.

**Response `200`**
```json
{ "ok": true }
```

**Response `404`**
```json
{ "error": "Not found" }
```

---

### POST /connections/:id/test

Testa a conectividade com o banco.

**Response `200`**
```json
{ "ok": true, "message": "Connected successfully" }
```

**Response `400`**
```json
{ "ok": false, "error": "Connection refused" }
```

---

## Conexões de API

### GET /api-connections

Lista todas as conexões de API. `auth_value` não é retornado.

**Response `200`**
```json
[
  {
    "id": 1,
    "name": "API Vendas",
    "base_url": "https://api.exemplo.com/v1",
    "auth_type": "bearer",
    "auth_header": null,
    "headers": null,
    "created_at": "2024-01-01T00:00:00Z"
  }
]
```

---

### POST /api-connections

**Request**
```json
{
  "name": "API Vendas",
  "base_url": "https://api.exemplo.com/v1",
  "auth_type": "bearer",
  "auth_value": "meu-token-secreto",
  "headers": "{\"X-Tenant\": \"empresa\"}"
}
```

`auth_type` aceita: `none`, `bearer`, `apikey`, `basic`

Para `apikey`, use `auth_header` para definir o nome do header (ex: `X-API-Key`).

**Response `200`**
```json
{ "id": 1 }
```

---

### PUT /api-connections/:id

Atualiza uma conexão de API. Todos os campos são opcionais.

**Response `200`**
```json
{ "ok": true }
```

---

### DELETE /api-connections/:id

**Response `200`**
```json
{ "ok": true }
```

---

### POST /api-connections/:id/test

Faz uma requisição de teste (GET na base URL).

**Response `200`**
```json
{ "ok": true, "message": "HTTP 200" }
```

**Response `400`**
```json
{ "ok": false, "error": "HTTP 401" }
```

---

## Jobs

### GET /jobs

Lista todos os jobs com informações da conexão e do último run.

**Response `200`**
```json
[
  {
    "id": 1,
    "name": "Vendas Diárias",
    "source_type": "db",
    "connection_id": 1,
    "connection_name": "ERP SQL Server",
    "destination_table": "vendas",
    "schedule_enabled": 1,
    "schedule_cron": "0 3 * * *",
    "last_run_status": "success",
    "last_run_at": "2024-06-01T03:00:00Z"
  }
]
```

---

### GET /jobs/:id

Retorna um job específico com todos os campos.

**Response `404`**
```json
{ "error": "Not found" }
```

---

### POST /jobs

Cria um novo job.

**Request — job de banco de dados**
```json
{
  "name": "Vendas Diárias",
  "source_type": "db",
  "connection_id": 1,
  "sql_template": "SELECT * FROM vendas WHERE data BETWEEN '{{data_inicio}}' AND '{{data_fim}}'",
  "destination_table": "vendas",
  "date_column": "data",
  "code_column": "id_venda",
  "window_size": "day",
  "date_from": "2024-01-01",
  "date_to": "2024-06-30",
  "concurrency": 4,
  "chunk_size": 5000,
  "schedule_enabled": 1,
  "schedule_cron": "0 3 * * *",
  "monthly_reprocess": 0
}
```

**Request — job de API REST**
```json
{
  "name": "Pedidos API",
  "source_type": "api",
  "api_connection_id": 1,
  "api_endpoint": "/pedidos?from={{data_inicio}}&to={{data_fim}}",
  "api_method": "GET",
  "api_data_path": "data.items",
  "api_pagination_type": "page",
  "api_page_param": "page",
  "api_page_size": 100,
  "destination_table": "pedidos",
  "date_column": "data_pedido",
  "code_column": "id_pedido",
  "window_size": "day"
}
```

**Campos de jobs**

| Campo | Tipo | Padrão | Descrição |
|-------|------|--------|-----------|
| `name` | string | — | Nome do job |
| `source_type` | `db` \| `api` | `db` | Tipo de origem |
| `connection_id` | number | — | FK conexão DB (quando `source_type=db`) |
| `api_connection_id` | number | — | FK conexão API (quando `source_type=api`) |
| `sql_template` | string | — | SQL com variáveis `{{...}}` (DB) ou body da requisição (API POST) |
| `api_endpoint` | string | — | Endpoint com variáveis `{{...}}` |
| `api_method` | string | `GET` | Método HTTP |
| `api_data_path` | string | — | Dot-notation para o array na resposta (ex: `data.items`) |
| `api_pagination_type` | `none` \| `page` \| `offset` \| `cursor` | `none` | Estratégia de paginação |
| `api_page_param` | string | — | Nome do parâmetro de página/cursor |
| `api_page_size` | number | — | Tamanho da página |
| `api_next_path` | string | — | Dot-notation para o próximo cursor na resposta |
| `api_config` | string (JSON) | — | Config avançada de API (ver abaixo) |
| `destination_table` | string | — | Tabela de destino no PostgreSQL |
| `schema` | string | — | Schema de destino |
| `loja` | string | — | Filtro de loja (vírgulas para múltiplos: `001,002`) |
| `date_column` | string | — | Coluna de data para DELETE por período |
| `code_column` | string | — | Coluna única para upsert (ON CONFLICT) |
| `window_size` | `day` \| `week` \| `month` | `month` | Tamanho da janela de período |
| `date_from` | string (YYYY-MM-DD) | — | Início do range |
| `date_to` | string (YYYY-MM-DD) | — | Fim do range |
| `concurrency` | number | `4` | Janelas em paralelo |
| `chunk_size` | number | `5000` | Linhas por chunk |
| `schedule_enabled` | `0` \| `1` | `0` | Habilita agendamento |
| `schedule_cron` | string | — | Expressão cron (ex: `0 3 * * *`) |
| `monthly_reprocess` | `0` \| `1` | `0` | Reprocessa o mês anterior no dia 1 às 01:00 |
| `webhook_url` | string | — | URL chamada via POST após cada run |
| `field_mapping` | string (JSON) | — | Mapeamento de campos (ver abaixo) |

**Response `200`**
```json
{ "id": 1 }
```

---

### PUT /jobs/:id

Atualiza um job. Todos os campos são opcionais.

**Response `200`**
```json
{ "ok": true }
```

---

### DELETE /jobs/:id

Remove um job e todos os seus runs/logs.

**Response `200`**
```json
{ "ok": true }
```

---

### POST /jobs/:id/start

Inicia o job com o range `date_from`/`date_to` configurado no job.

**Response `200`**
```json
{ "ok": true, "run_id": 42 }
```

**Response `409`** — job já em execução
```json
{ "error": "Job already running" }
```

---

### POST /jobs/:id/stop

Aborta o run em execução.

**Response `200`**
```json
{ "ok": true }
```

---

### POST /jobs/:id/reprocess

Reprocessa o job com um range de datas personalizado.

**Request**
```json
{
  "date_from": "2024-01-01",
  "date_to": "2024-03-31"
}
```

**Response `200`**
```json
{ "ok": true, "run_id": 43 }
```

---

## Runs e Logs

### GET /jobs/:id/runs

Retorna os últimos 50 runs do job (mais recentes primeiro).

**Response `200`**
```json
[
  {
    "id": 42,
    "job_id": 1,
    "status": "success",
    "rows_read": 15000,
    "rows_written": 15000,
    "started_at": "2024-06-01T03:00:00Z",
    "finished_at": "2024-06-01T03:02:10Z"
  }
]
```

`status` pode ser: `running`, `success`, `error`, `aborted`

---

### GET /runs/:id

Retorna os detalhes de um run específico.

**Response `404`**
```json
{ "error": "Not found" }
```

---

### GET /runs/:id/logs

Retorna os logs de um run. Use `after` para polling incremental.

**Query params**

| Param | Tipo | Descrição |
|-------|------|-----------|
| `after` | number | Retorna apenas logs com `id > after` (para polling) |

**Response `200`**
```json
{
  "logs": [
    {
      "id": 100,
      "level": "info",
      "message": "Janela 2024-06-01 → 5000 linhas",
      "created_at": "2024-06-01T03:00:05Z"
    }
  ],
  "status": "running",
  "rows_read": 5000,
  "rows_written": 5000
}
```

`level` pode ser: `info`, `warn`, `error`

> Para acompanhar logs em tempo real, faça polling a cada 2s usando `after=<último id recebido>` até que `status` não seja mais `running`.

---

## Dados (leitura do PostgreSQL destino)

Estas rotas leem do banco PostgreSQL de destino. Aceitam JWT **ou** API Token.

### GET /data

Lista todas as tabelas disponíveis.

**Response `200`**
```json
{
  "tables": [
    { "name": "vendas", "row_estimate": 1500000 },
    { "name": "pedidos", "row_estimate": 320000 }
  ]
}
```

---

### GET /data/:table/columns

Retorna o schema de uma tabela.

**Response `200`**
```json
{
  "table": "vendas",
  "columns": [
    { "name": "id_venda", "type": "bigint", "position": 1, "nullable": false },
    { "name": "data", "type": "timestamptz", "position": 2, "nullable": true },
    { "name": "valor", "type": "numeric", "position": 3, "nullable": true }
  ]
}
```

**Response `404`** — tabela não encontrada

---

### GET /data/:table

Consulta dados de uma tabela com filtros, ordenação e paginação.

**Query params**

| Param | Tipo | Padrão | Descrição |
|-------|------|--------|-----------|
| `limit` | number | `100` | Máximo de linhas (teto: 10.000) |
| `offset` | number | `0` | Deslocamento |
| `order_by` | string | — | Coluna de ordenação |
| `order_dir` | `asc` \| `desc` | `asc` | Direção da ordenação |

**Filtros dinâmicos** — sufixo no nome do parâmetro:

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

**Exemplo de requisição**
```
GET /api/data/vendas?limit=50&order_by=data&order_dir=desc&status=ativo&valor__gte=100
```

**Response `200`**
```json
{
  "data": [{ "id_venda": 1, "data": "2024-06-01", "valor": 150.00 }],
  "total": 1500000,
  "limit": 50,
  "offset": 0
}
```

---

### POST /data/:table

Insere linhas em uma tabela. Suporta mapeamento de campos opcional.

**Request — formato simples**
```json
[
  { "id": 1, "data": "2024-06-01", "valor": 150.00 }
]
```

**Request — com mapeamento**
```json
{
  "rows": [
    { "campo_a": "42", "campo_b": "2024-01-01" }
  ],
  "mapping": {
    "select": ["campo_a", "campo_b"],
    "rename": { "campo_a": "id", "campo_b": "data" },
    "cast": { "id": "integer", "data": "date" },
    "fixed": { "sistema": "ERP" }
  }
}
```

**`mapping` — campos disponíveis**

| Campo | Efeito |
|-------|--------|
| `select` | Whitelist de campos da origem; omitir = todos |
| `rename` | Renomeia campo: `origem → destino` |
| `cast` | Converte tipo: `number`, `integer`, `date`, `boolean`, `string`, `json` |
| `fixed` | Adiciona campo com valor fixo em todas as linhas |

Ordem de aplicação: `select → rename → cast → fixed`

**Response `200`**
```json
{ "ok": true, "inserted": 1 }
```

---

## Configuração avançada de API (`api_config`)

JSON livre passado no campo `api_config` do job para casos especiais:

| Chave | Efeito |
|-------|--------|
| `"graphql": true` | Encapsula o body em `{"query": "...", "variables": {...}}` |
| `"variables": {...}` | Variáveis extras para GraphQL |
| `"page_size_param": "per_page"` | Nome do parâmetro de tamanho de página (padrão: `limit`) |
| `"first_page": 0` | Primeira página (padrão: `1`) |
| `"offset_param": "skip"` | Nome do parâmetro de offset (padrão: `offset`) |
| `"limit_param": "take"` | Nome do parâmetro de limite para offset (padrão: `limit`) |

**Exemplo — API GraphQL**
```json
{
  "graphql": true,
  "variables": { "tenant": "empresa" }
}
```

---

## Webhook pós-execução

Se `webhook_url` estiver configurado no job, após cada run o backend faz:

```
POST <webhook_url>
Content-Type: application/json
```

**Body**
```json
{
  "job_id": 1,
  "job_name": "Vendas Diárias",
  "run_id": 42,
  "status": "success",
  "rows_read": 15000,
  "rows_written": 15000,
  "started_at": "2024-06-01T03:00:00Z",
  "finished_at": "2024-06-01T03:02:10Z"
}
```

Timeout de 10s. Falhas são registradas nos logs do run como `warn` e não interrompem o fluxo.

---

## Variáveis de template

Disponíveis em `sql_template` e `api_endpoint`:

| Variável | Valor |
|----------|-------|
| `{{data_inicio}}` | Data de início da janela (YYYY-MM-DD) |
| `{{data_fim}}` | Data de fim da janela (YYYY-MM-DD) |
| `{{schema}}` | Campo `schema` do job |
| `{{loja}}` | Campo `loja` do job — vírgulas viram lista SQL: `'001', '002'` |

Exemplo com `loja`:
```sql
SELECT * FROM vendas WHERE loja IN ({{loja}}) AND data BETWEEN '{{data_inicio}}' AND '{{data_fim}}'
```

---

## Códigos de resposta

| Código | Significado |
|--------|-------------|
| `200` | Sucesso |
| `400` | Requisição inválida (body malformado, parâmetro inválido) |
| `401` | Não autenticado |
| `403` | Token de API usado em rota não permitida |
| `404` | Recurso não encontrado |
| `409` | Conflito (ex: job já em execução) |
| `500` | Erro interno do servidor |
