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
JOIN (
  -- catálogo expandido: 1 linha por (produto, empresa) — ver seção 4
  SELECT pr.produto, pr.custo, trim(emp) AS empresa
  FROM produtos pr,
       unnest(regexp_split_to_array(pr.empresa, ',')) AS emp
) p
  ON p.produto = e.produto
 AND p.empresa = e.empresa
WHERE e.data <= :data_referencia
  -- aplicar filtros opcionais de empresa/loja quando vierem
GROUP BY e.empresa, e.loja
HAVING SUM(e.qtde) > 0;
```

> O `custo` usado é o **valor atual** da coluna `produtos.custo` no momento da consulta —
> é exatamente o comportamento desejado ("custo que sempre muda"). Nada de congelar.

---

## 4. Multi-empresa — JOIN por (produto, empresa) com catálogo expandido

Hoje o cadastro `produtos` tem a coluna `empresa` em formato **multi-valor** — ex.:
`empresa = "abys, o&a"` — indicando a quais empresas o produto pertence, com um **único**
`custo`. Confirmado: 100% das linhas atuais têm `empresa = "abys, o&a"`. Já em `estoques` o
`empresa` é **single-valor** (`"abys"`, `"o&a"`).

Por isso um equi-join direto **não funciona** e produz resultado vazio:

```sql
-- ❌ NUNCA: "abys, o&a" = "abys" nunca casa → data: []
JOIN produtos p ON p.produto = e.produto AND p.empresa = e.empresa
```

**Requisito de futuro:** vão entrar **outras empresas**, e o **mesmo código** poderá ser um
produto **diferente, com custo próprio** por empresa. Logo a relação por empresa **precisa
existir** — não basta casar só por produto.

**Solução: expandir o catálogo por empresa e casar por `(produto, empresa)`** (ver SQL da
seção 3):

```sql
JOIN (
  SELECT pr.produto, pr.custo, trim(emp) AS empresa
  FROM produtos pr,
       unnest(regexp_split_to_array(pr.empresa, ',')) AS emp
) p
  ON p.produto = e.produto AND p.empresa = e.empresa   -- ✅
```

- **Hoje:** `"abys, o&a"` expande em 2 linhas (`abys`, `o&a`) com o mesmo custo → cada estoque
  casa com a sua empresa. Resultado idêntico ao de casar só por produto (não fica vazio).
- **Futuro:** a empresa nova entra como linha própria no catálogo (ex.: `empresa = "xyz"`,
  custo próprio) e casa **só** com o estoque de `xyz`. A relação por empresa passa a valer
  sem mudar a query.

**Integridade necessária:** cada par `(produto, empresa)` deve resolver para **um** custo. Se
o catálogo vier a ter duas linhas que cubram a mesma empresa para o mesmo produto, o join
multiplica as linhas de estoque (infla `pecas`/`custo_atual`). Garantir unicidade de
`(produto, empresa)` após a expansão.

**Sintoma do bug original:** o endpoint respondia 200 com `{"data": []}` para qualquer filtro
(inclusive `loja=006`, que comprovadamente tem ~2.124 produtos em estoque). Causa: o inner join
direto `p.empresa = e.empresa` (`"abys, o&a"` ≠ `"abys"`) descartava todas as linhas. Fix: o
JOIN com catálogo expandido acima. Validado na loja 006: 21.029 peças, R$ 1.747.731.

---

## 5. Performance — saldo materializado (IMPLEMENTADO)

A query sobre `estoques` (~45,6M linhas) levava ~26s/loja e dava **504** sem filtro. Resolvido
com pré-agregação mantida pelo ETL do integrador:

1. ✅ **Tabela `estoque_saldo (empresa, loja, produto, pecas, atualizado_em)`** com o saldo
   pré-somado. O endpoint só faz `JOIN estoque_saldo × produtos` e agrega por loja → resposta
   em milissegundos, independentemente do tamanho de `estoques`. PK `(empresa, loja, produto)`.
2. ✅ **Job de full refresh** (`npm run refresh-saldo`): `TRUNCATE` + `INSERT…SELECT SUM(qtde)
   GROUP BY (empresa, loja, produto)` numa transação. Deve ser agendado (cron) no integrador.
   Fonte: `backend/src/scripts/refresh-estoque-saldo.ts`.
3. ✅ **`saldo_atualizado_em`** na resposta (`MAX(atualizado_em)`) para o painel saber o frescor,
   e **`fonte`** (`"saldo"` rápido | `"estoques"` fallback).

**`data` histórica:** o snapshot é do saldo **atual**. Quando vem `data` no passado, o endpoint
cai no scan direto de `estoques` (`fonte: "estoques"`, lento mas correto). Se `estoque_saldo`
ainda não existir, também cai no scan direto. O caso comum do painel (custo atual) usa o
caminho rápido.

> Refresh é **full** hoje (recalcula tudo). Evoluir para incremental — atualizar só os
> `(empresa, loja, produto)` alterados — é a próxima otimização se o full ficar pesado.

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
2. Join `estoques × produtos` por `(produto, empresa)` com o catálogo **expandido** por empresa (`unnest` do `empresa` multi-valor) — seção 4. Um equi-join direto dá `data: []`; casar só por produto resolve hoje mas quebra quando entrarem novas empresas com o mesmo código.
3. Agregação por loja no banco; retorno de ~38 linhas (seção 3).
4. Idealmente apoiado por **tabela de saldo materializada** mantida pelo ETL (seção 5).
5. Mesmo esquema de auth (Bearer token GET-only) já em uso.
