# Spec — Endpoint de Custo Atual de Estoque (Integrador ETL)

> Documento para o time que mantém o **integrador** (`integrador.corp.abys.com.br`).
> Objetivo: substituir o cálculo pesado feito hoje no painel por **um endpoint dedicado**
> que faz o `JOIN estoques × produtos` e a agregação **no banco do integrador**,
> devolvendo poucos números prontos.

---

## 1. Problema que este endpoint resolve

O painel precisa exibir o estoque valorado ao **custo de cadastro atual** do produto
(diferente do custo ponderado histórico). O cálculo é:

```
custo_atual(loja) = Σ ( saldo_de_peças(produto) × custo_cadastro(produto) )
                    para todos os produtos com saldo > 0 naquela loja
```

- **Saldo de peças** vem da tabela `estoques` (movimentações, ~45,6M linhas):
  `saldo = SUM(qtde) WHERE data <= alvo`, agrupado por produto.
- **Custo de cadastro** vem da tabela `produtos` (coluna `custo`, ~134k linhas).

### Por que o endpoint genérico não serve

Tentar isso via `GET /api/data/estoques?group_by=loja,produto&sum=qtde` **estoura (504)**:
o `group_by` por produto gera dezenas de milhares de grupos por loja, e o endpoint
**pagina o resultado por HTTP** (5000/página) sobre toda a história → o nginx encerra
em ~180s. O cálculo em si é trivial para o banco; o gargalo é **transferir milhões de
linhas** para o cliente agregar. Um endpoint dedicado agrega no banco e devolve ~38 linhas.

---

## 2. Contrato proposto

### Request

```
GET /api/estoque/custo-atual
Authorization: Bearer <token>          # mesmo esquema de hoje (token GET-only basta)
```

Query params (todos opcionais):

| Param | Tipo | Descrição |
|---|---|---|
| `empresa` | string | Filtra por empresa (ex.: `abys`, `o&a`). Omitido = todas. |
| `loja` | string | Filtra por uma loja específica. Omitido = todas. |
| `data` | `YYYY-MM-DD` | Saldo "a esta data" (`data <= valor`). Default = hoje. |

### Response (200)

```json
{
  "data": [
    { "empresa": "abys", "loja": "006", "pecas": 21025, "custo_atual": 1746224.24 },
    { "empresa": "abys", "loja": "007", "pecas": 14380, "custo_atual": 1102993.10 },
    { "empresa": "o&a",  "loja": "O41", "pecas":  8123, "custo_atual":  640221.55 }
  ],
  "data_referencia": "2026-06-24"
}
```

- Uma linha por **(empresa, loja)**. Para 3 empresas / ~38 lojas, são ~38 linhas.
- `custo_atual` = `SUM(qtde × produtos.custo)`; `pecas` = `SUM(qtde)`.
- Apenas lojas com `pecas > 0` (lojas zeradas podem ser omitidas).

---

## 3. Lógica de cálculo (SQL de referência)

```sql
SELECT
  e.empresa,
  e.loja,
  SUM(e.qtde)                 AS pecas,
  SUM(e.qtde * p.custo)       AS custo_atual
FROM estoques e
JOIN produtos p
  ON p.produto = e.produto        -- SÓ por produto (catálogo global) — ver seção 4
WHERE e.data <= :data_referencia
  -- aplicar filtros opcionais de empresa/loja quando vierem
GROUP BY e.empresa, e.loja
HAVING SUM(e.qtde) > 0;
```

> O `custo` usado é o **valor atual** da coluna `produtos.custo` no momento da consulta —
> é exatamente o comportamento desejado ("custo que sempre muda"). Nada de congelar.

---

## 4. Multi-empresa — JOIN APENAS por produto (NÃO por empresa)

⚠️ **Correção crítica (validada nos dados reais).** Uma versão anterior desta spec sugeria
casar o join por `produto` **e** `empresa`. Isso está **errado** e produz resultado vazio.

O cadastro `produtos` é um **catálogo global**: cada produto é uma única linha, com a coluna
`empresa` em formato **multi-valor** — ex.: `empresa = "abys, o&a"` — indicando a quais
empresas o produto pertence, e um **único** `custo`. Confirmado: 100% das linhas de `produtos`
têm `empresa = "abys, o&a"`. Já em `estoques` o `empresa` é **single-valor** (`"abys"`, `"o&a"`).

Portanto:

```sql
JOIN produtos p ON p.produto = e.produto      -- ✅ correto
-- AND p.empresa = e.empresa                  -- ❌ NUNCA: "abys, o&a" = "abys" nunca casa → vazio
```

O escopo por empresa já vem do lado de `estoques` (cada movimento é de uma empresa+loja); o
custo é global por produto. Não há custo distinto por empresa para o mesmo código.

**Sintoma do bug:** o endpoint responde 200 com `{"data": []}` para qualquer filtro (inclusive
`loja=006`, que comprovadamente tem ~2.124 produtos em estoque). Causa: o inner join com
`p.empresa = e.empresa` descarta todas as linhas. Fix: remover a condição de empresa do join.

---

## 5. Performance — recomendações

A query acima varre ~45,6M linhas a cada chamada. Mesmo agregando no banco, sem apoio pode
levar de segundos a ~1min. Como o painel pode chamar isto a cada carga, recomenda-se:

1. **Índice** em `estoques (empresa, loja, produto, data)` e em `produtos (empresa, produto)`.
2. **Idealmente, uma tabela/materialized view de saldo** mantida pelo próprio ETL do
   integrador — ex.: `estoque_saldo (empresa, loja, produto, pecas)` atualizada
   incrementalmente. Aí o endpoint só faz `JOIN` dessa view com `produtos` e agrega por
   loja → resposta em milissegundos, independentemente do tamanho de `estoques`.
3. Se materializar, expor também a **data/hora da última atualização** do saldo na resposta
   (campo `saldo_atualizado_em`) para o painel saber o frescor.

Sem a materialized view o endpoint ainda resolve o 504 (não pagina o resultado), mas pode
ficar lento sob carga — a view é o que o torna instantâneo.

---

## 6. Casos de borda

- **Produto em `estoques` sem cadastro em `produtos`:** hoje esses itens são ignorados no
  nosso lado (~0,05% das linhas por loja). No endpoint, o `JOIN` (inner) já os descarta —
  comportamento aceitável. Se preferirem sinalizar, podem devolver um `pecas_sem_custo` à parte.
- **Saldo negativo por produto** (dados incompletos): tratar como 0 (não subtrair do total).
  Equivale a `GREATEST(SUM(qtde), 0)` por produto — opcionalmente aplicar antes do `SUM` externo.
- **`data` futura ou sem movimento:** retorna o que houver até a data; lojas sem saldo somem
  pelo `HAVING`.

---

## 7. Variante opcional — detalhe por produto

O painel principal só precisa do total por loja (seção 2). Mas o **Relatório em Árvore**
pode, no futuro, querer custo atual por dimensão de produto. Se for barato, um segundo
endpoint/param seria útil:

```
GET /api/estoque/custo-atual?detalhe=produto&empresa=abys&loja=006
→ [ { produto, pecas, custo_unitario_atual, custo_atual }, ... ]
```

Não é necessário para a entrega atual — só registrar como possível evolução.

---

## 8. Como o painel vai consumir

Do lado do painel a mudança é **isolada e pequena**: a função
`fetchCurrentCostInventory(lojaIds, ano, mes)` (em `src/repositories/sales.repository.ts`)
deixa de varrer a tabela `EstoqueProduto` e passa a **chamar este endpoint** (com cache
curto, ex.: 5-10 min). Com isso:

- A tabela `EstoqueProduto` e o job de backfill/refresh podem ser **descontinuados**.
- O custo atual fica **sempre vivo** (join na hora) e o painel pode até consultá-lo on-demand.

Enquanto o endpoint não existe, o painel usa o `EstoqueProduto` já populado (solução-ponte).

---

## 9. Resumo do que pedimos ao time do integrador

1. Um endpoint `GET /api/estoque/custo-atual` conforme seção 2.
2. Join `estoques × produtos` **APENAS por `produto`** — nunca por empresa (seção 4). ⚠️ é a causa do `data: []` atual.
3. Agregação por loja no banco; retorno de ~38 linhas (seção 3).
4. Idealmente apoiado por **tabela de saldo materializada** mantida pelo ETL (seção 5).
5. Mesmo esquema de auth (Bearer token GET-only) já em uso.
