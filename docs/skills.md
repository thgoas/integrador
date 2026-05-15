# Skills — Guia de Operações

Referência rápida para tarefas comuns no projeto.

---

## Adicionar um novo campo ao Job

1. **`backend/src/db/schema.sql`** — adicionar coluna na definição da tabela `jobs`
2. **`backend/src/db/sqlite.ts`** — adicionar `"ALTER TABLE jobs ADD COLUMN ..."` no array `alterations`
3. **`backend/src/api/routes/jobs.ts`** — adicionar no type do Body do POST, no destructuring, no INSERT, no array `fields` do PUT e no `.run(...)` do UPDATE
4. **`frontend/src/api/types.ts`** — adicionar em `Job` e `JobInput`
5. **`frontend/src/pages/JobForm.tsx`** — adicionar em `defaultForm` e no carregamento do job existente, criar o campo no formulário
6. **`frontend/src/pages/JobDetail.tsx`** — mostrar o campo na seção Configuração

> **Nota**: `date_mode` ('fixed' | 'current_month' | 'last_month') controla como datas são resolvidas no runner. Adicionar `date_mode: 'fixed'` nos overrides do cron e do `/reprocess` para que datas explícitas não sejam sobrescritas pelo `resolveDates()`.

## Adicionar uma nova conexão de banco de origem

Editar **`backend/src/etl/extractor.ts`**:
1. Adicionar o novo tipo no `if/else` do `extractChunked`
2. Implementar a função `extract<Tipo>` seguindo o padrão das existentes (retornar `AsyncGenerator<Record<string, any>[]>`)
3. Adicionar o tipo no CHECK do `schema.sql`
4. Adicionar a opção no `<select>` do `frontend/src/pages/Connections.tsx`

## Adicionar uma nova rota no backend

1. Criar ou editar arquivo em `backend/src/api/routes/`
2. Registrar no `backend/src/api/server.ts` com `app.register(..., { prefix: '/api' })`
3. Rotas públicas (sem JWT): passar `{ config: { public: true } }` como opção da rota

## Adicionar um endpoint no cliente frontend

1. **`frontend/src/api/index.ts`** — adicionar método no grupo correto (`api.jobs`, `api.runs`, etc.)
2. Chamar via `api.<grupo>.<método>()` nas pages/components

## Adicionar uma migration no SQLite

Em `backend/src/db/sqlite.ts`, no array `alterations`:
```typescript
const alterations = [
  "ALTER TABLE jobs ADD COLUMN meu_campo TEXT",
  // ... demais
]
```
O try/catch garante idempotência — pode reiniciar sem erro se a coluna já existe.

---

## Testar o pipeline manualmente

```bash
# 1. Testar conexão de origem
curl -s -X POST http://localhost:3000/api/connections/1/test \
  -H "Authorization: Bearer <token>" | jq

# 2. Iniciar job
curl -s -X POST http://localhost:3000/api/jobs/1/start \
  -H "Authorization: Bearer <token>" | jq

# 3. Acompanhar logs (polling manual)
curl -s "http://localhost:3000/api/runs/1/logs?after=0" \
  -H "Authorization: Bearer <token>" | jq

# 4. Parar job
curl -s -X POST http://localhost:3000/api/jobs/1/stop \
  -H "Authorization: Bearer <token>" | jq

# 5. Reprocessar período específico
curl -s -X POST http://localhost:3000/api/jobs/1/reprocess \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"date_from":"2026-01-01","date_to":"2026-01-31"}' | jq
```

## Obter token JWT para testes

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r .token)
echo $TOKEN
```

---

## Diagnóstico de problemas comuns

### Dados não chegam ao banco de destino
1. Verificar no console do backend se aparece `[dest-pg] Conectado ao banco "..."` na inicialização
2. Verificar logs do run — o runner loga cada etapa (criação de tabela, COPY, upsert, erros)
3. Confirmar que `DEST_PG_*` no `.env` apontam para o banco correto

### Logs não aparecem no frontend
- Verificar no DevTools → Network se as requests a `/api/runs/*/logs` retornam 200 com header `Authorization`
- 401 indica token ausente/expirado → fazer logout e login novamente

### Job fica em `running` após erro
O runner atualiza o status para `failed`/`stopped` no `finally`. Se o processo morreu bruscamente, atualizar manualmente:
```sql
UPDATE jobs SET status = 'idle' WHERE id = ?;
UPDATE runs SET status = 'failed', finished_at = CURRENT_TIMESTAMP WHERE id = ?;
```

### Erro `FST_ERR_CTP_EMPTY_JSON_BODY`
O backend tem parser customizado que aceita bodies vazios. Se aparecer novamente, verificar se o `addContentTypeParser` está registrado antes das rotas em `server.ts`.

### Erro de tipo no COPY (`invalid input syntax for type timestamp`)
A coluna tem tipo `TIMESTAMPTZ` no destino mas o valor vindo da origem não é um objeto `Date`. Verificar `formatCsvValue` em `loader.ts` — `Date` deve virar `.toISOString()`.

### Duplicação de dados
- Se `code_column` configurada: o upsert deve evitar duplicatas. Verificar se o unique index foi criado na tabela destino.
- Se só `date_column`: o DELETE usa `::date` para cobrir o dia inteiro independente da hora. Verificar se a coluna informada existe no destino.

---

## Estrutura de um novo job típico

```
Nome: Vendas Loja 001
Conexão: ERP (mssql)
Schema: dbo
Loja: 001,002,003
Tabela destino: fact_vendas
Coluna código: numero          ← chave única para upsert
Coluna data: dtvenda           ← só relevante se não usar code_column
Data inicial: 2026-01-01
Data final: 2026-12-31
Janela: month
Concorrência: 4
Chunk size: 5000

SQL Template:
SELECT
  numero,
  dtvenda,
  loja,
  produto,
  quantidade,
  total
FROM {{schema}}.vendas
WHERE loja IN ({{loja}})
  AND dtvenda BETWEEN '{{data_inicio}}' AND '{{data_fim}}'
```
