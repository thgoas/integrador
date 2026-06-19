# GET /api/data/:table — Referência completa

Endpoint genérico de leitura do PostgreSQL destino. Suporta filtros dinâmicos, paginação, ordenação e agregação (GROUP BY + funções de agregação). Funciona automaticamente para qualquer tabela criada pelo ETL, sem configuração prévia.

**Autenticação:** JWT (`Authorization: Bearer <jwt>`) ou token de API (`Authorization: Bearer itg_<64hex>`).  
**Escopo de tokens de API:** somente `GET /api/data/*`.

---

## Parâmetros de paginação e ordenação

| Parâmetro | Padrão | Máximo | Descrição |
|-----------|--------|--------|-----------|
| `limit` | `100` | `10000` | Número de linhas (ou grupos) a retornar |
| `offset` | `0` | — | Deslocamento para paginação |
| `order_by` | — | — | Nome da coluna ou alias de agregação para ordenar |
| `order_dir` | `asc` | — | Direção: `asc` ou `desc` |

---

## Filtros dinâmicos

Qualquer parâmetro que não seja reservado é interpretado como filtro. Operadores são indicados por sufixo no nome do parâmetro.

| Sintaxe | Operador SQL | Exemplo |
|---------|-------------|---------|
| `col=valor` | `= $n` | `?status=ativo` |
| `col__gt=valor` | `> $n` | `?valor__gt=1000` |
| `col__gte=valor` | `>= $n` | `?data__gte=2024-01-01` |
| `col__lt=valor` | `< $n` | `?data__lt=2024-12-31` |
| `col__lte=valor` | `<= $n` | `?preco__lte=500` |
| `col__like=valor` | `ILIKE $n` | `?nome__like=João%` |
| `col__in=v1,v2,v3` | `= ANY($n)` | `?status__in=ativo,inativo` |
| `col__null=true` | `IS NULL` | `?deletado_em__null=true` |
| `col__null=false` | `IS NOT NULL` | `?deletado_em__null=false` |

Múltiplos filtros são combinados com `AND`. Todos os valores são parametrizados (sem risco de SQL injection).

---

## Agregação (GROUP BY)

Quando `group_by` ou qualquer função de agregação está presente, o endpoint entra em **modo de agregação**. Os filtros dinâmicos continuam funcionando como `WHERE` aplicado antes do `GROUP BY`.

| Parâmetro | SQL gerado | Alias no retorno | Exemplo |
|-----------|-----------|-----------------|---------|
| `group_by=col1,col2` | `GROUP BY "col1", "col2"` | (colunas aparecem com seu nome original) | `?group_by=loja,mes` |
| `sum=col` | `SUM("col")` | `sum_col` | `?sum=valor` |
| `sum=col1,col2` | `SUM("col1"), SUM("col2")` | `sum_col1`, `sum_col2` | `?sum=valor,qtd` |
| `avg=col` | `AVG("col")` | `avg_col` | `?avg=preco` |
| `count=*` | `COUNT(*)` | `count` | `?count=*` |
| `count=col` | `COUNT("col")` | `count_col` | `?count=id` |
| `count_distinct=col` | `COUNT(DISTINCT "col")` | `count_distinct_col` | `?count_distinct=venda` |
| `count_distinct=c1,c2` | `COUNT(DISTINCT "c1"), COUNT(DISTINCT "c2")` | `count_distinct_c1`, `count_distinct_c2` | `?count_distinct=venda,cliente` |
| `min=col` | `MIN("col")` | `min_col` | `?min=data` |
| `max=col` | `MAX("col")` | `max_col` | `?max=data` |

**Comportamento em modo de agregação:**
- `total` no response passa a ser o número de **grupos distintos**, não de linhas brutas
- `limit`/`offset` paginam os grupos
- `order_by` pode referenciar colunas do grupo ou aliases gerados (`sum_valor`, `count`, `avg_preco`, etc.)
- `sum`, `avg`, `min`, `max` aceitam múltiplas colunas separadas por vírgula

---

## Response

```json
{
  "data": [ /* array de objetos */ ],
  "total": 1234,
  "limit": 100,
  "offset": 0
}
```

Em modo de agregação, cada objeto em `data` contém as colunas do `group_by` e os aliases das funções de agregação.

---

## Exemplos

### Listagem simples com filtro e paginação

```
GET /api/data/vendas?status=ativo&limit=50&offset=0&order_by=data&order_dir=desc
```

```json
{
  "data": [{ "id": 1, "loja": "001", "valor": 150.00, "status": "ativo", "data": "2024-03-15" }],
  "total": 3200,
  "limit": 50,
  "offset": 0
}
```

---

### Total de vendas por loja (ordenado pelo maior valor)

```
GET /api/data/vendas?group_by=loja&sum=valor&count=*&order_by=sum_valor&order_dir=desc
```

```json
{
  "data": [
    { "loja": "003", "sum_valor": 98500.00, "count": 412 },
    { "loja": "001", "sum_valor": 72300.00, "count": 318 }
  ],
  "total": 15,
  "limit": 100,
  "offset": 0
}
```

---

### Média e total de vendas por loja e mês, com filtro de data

```
GET /api/data/vendas?group_by=loja,mes&sum=valor&avg=ticket&data__gte=2024-01-01&order_by=mes
```

```json
{
  "data": [
    { "loja": "001", "mes": "2024-01", "sum_valor": 24000.00, "avg_ticket": 320.50 },
    { "loja": "002", "mes": "2024-01", "sum_valor": 18500.00, "avg_ticket": 275.00 }
  ],
  "total": 30,
  "limit": 100,
  "offset": 0
}
```

---

### Data mais antiga e mais recente por cliente

```
GET /api/data/pedidos?group_by=cliente_id&min=data&max=data&count=*
```

```json
{
  "data": [
    { "cliente_id": 42, "min_data": "2022-05-10", "max_data": "2024-11-30", "count": 17 }
  ],
  "total": 890,
  "limit": 100,
  "offset": 0
}
```

---

### Uso via Power BI / token de API

```http
GET /api/data/vendas?group_by=loja&sum=valor&count=*
Authorization: Bearer itg_<seu_token_aqui>
```

---

## Outros endpoints de dados

| Endpoint | Descrição |
|----------|-----------|
| `GET /api/data` | Lista todas as tabelas com estimativa de linhas |
| `GET /api/data/:table/columns` | Retorna colunas e tipos de uma tabela |
| `POST /api/data/:table` | Insere linhas (com mapeamento opcional) |
