# Spec — Custo Médio por Produto (média móvel ponderada)

> Documento para o time que mantém o **integrador** (`integrador.corp.abys.com.br`).
> Objetivo: expor o **custo médio (média móvel ponderada)** por produto, calculado a
> partir das **compras**, para o painel valorar o estoque a custo médio.
> Complementa a `SPEC-ENDPOINT-CUSTO-ATUAL.md` (custo atual = `produtos.custo`).

> ✅ **Implementado no integrador.** Tabela `custo_medio_produto` + `npm run refresh-custo-medio`
> ([`backend/src/scripts/refresh-custo-medio.ts`](backend/src/scripts/refresh-custo-medio.ts),
> lógica em [`backend/src/etl/custo-medio.ts`](backend/src/etl/custo-medio.ts)) e endpoint
> `GET /api/estoque/custo-medio` ([`backend/src/api/routes/estoque.ts`](backend/src/api/routes/estoque.ts)).
> Coluna de custo da linha em `estoques` auto-detectada (env `CUSTO_MEDIO_COL` p/ override).
> Saldo clampado em 0 (estoque nunca negativo) — desvio robusto do §3 literal: dado incompleto
> (saída sem a compra original na janela) deixava o saldo negativo e gerava custo médio negativo.
> Falta validar os números contra o ERP no banco real (§5).

---

## 1. Problema

O painel precisa de **dois custos de estoque**:
- **Custo Atual** = `produtos.custo` (já entregue, via `estoque_saldo` + `/api/estoque/custo-atual`).
- **Custo Médio** = média móvel ponderada das compras — **falta**.

Tentar reconstruir o custo médio somando `estoques.custo_total` de todos os movimentos
**não funciona** (medido nos dados reais):
- As **saídas/transferências** vêm com `custo_unitário` placeholder **R$ 1** → "custo fantasma",
  inflando o resultado (custo NEGATIVO em algumas lojas, R$ 6 mil/peça em outras).
- **Nem toda entrada é compra** — transferências entre filiais geram entradas que não são compra.

A coluna **`compra` (boolean)** foi adicionada à `estoques` e resolve a **identificação**.
Falta o **cálculo cronológico** (média móvel), que é pesado (34,5M linhas de compra) e por isso
deve ser **materializado no integrador**.

---

## 2. A regra do custo médio

Na média móvel ponderada, **só a COMPRA altera o custo**. Todo o resto (venda, transferência)
mexe apenas na **quantidade**, ao custo médio vigente:

| Movimento | Efeito no custo médio |
|---|---|
| `compra = true` (entrada de fornecedor) | **valor += qtde × custo_unitário**, recalcula a média |
| `compra = false` (venda, transferência, ajuste) | só **quantidade** — o `custo_unitário` da linha é **ignorado** (é onde está o R$ 1) |

Isso torna o cálculo **imune ao R$ 1** e às transferências: o custo das saídas/transferências
nunca entra na conta.

---

## 3. Algoritmo (por produto, no nível da empresa)

Recomenda-se calcular **um custo médio por produto no nível da empresa** (transferências entre
filiais se anulam — saem de uma loja, entram em outra). O painel valora o estoque de cada loja
multiplicando as peças da loja pelo custo médio do produto.

Para cada produto, processar os movimentos **em ordem cronológica** (`data`):

```
saldo = 0 ; valor = 0 ; custo_medio = 0

para cada movimento (ordenado por data):
    se compra = true:                       -- COMPRA: define o custo
        valor  += qtde * custo_unitario
        saldo  += qtde
        custo_medio = valor / saldo
    senão:                                  -- venda / transferência: só quantidade
        saldo  += qtde                      -- qtde negativa em saída
        valor  += qtde * custo_medio        -- baixa (ou entra) ao custo médio vigente
        -- custo_medio NÃO muda

-- resultado final do produto:
custo_medio_final = custo_medio
saldo_final       = saldo
```

> Observação: como as transferências entre filiais se anulam no nível da empresa, o `saldo` ao
> longo do tempo equivale a `compras − vendas`, e o `custo_medio` é determinado só pelas compras.
> O custo das vendas/transferências nunca é lido — por isso o R$ 1 é irrelevante.

---

## 4. View materializada e contrato

### View `custo_medio_produto`

| Coluna | Tipo | |
|---|---|---|
| `empresa` | text | empresa (ex.: `abys`, `o&a`) |
| `produto` | numeric | código do produto (mesmo tipo de `produtos.produto` / `estoque_saldo.produto`) |
| `custo_medio` | numeric | média móvel ponderada final |
| `atualizado_em` | timestamptz | data/hora do último recálculo |

Atualizada pelo ETL (full refresh periódico, com swap atômico — ver §5 da spec do `estoque_saldo`).

### Endpoint `GET /api/estoque/custo-medio`

Mesmo padrão do `/api/estoque/custo-atual`: faz `JOIN estoque_saldo × custo_medio_produto`
(por `produto`, e `empresa` quando aplicável) e agrega por **loja**:

```sql
SELECT s.empresa, s.loja,
       SUM(s.pecas)                  AS pecas,
       SUM(s.pecas * m.custo_medio)  AS custo_medio
FROM estoque_saldo s
JOIN custo_medio_produto m ON m.produto = s.produto   -- e empresa, se a view for por empresa
GROUP BY s.empresa, s.loja
HAVING SUM(s.pecas) > 0;
```

Resposta (≈ 38 linhas), igual ao custo atual:

```json
{ "data": [ { "empresa": "abys", "loja": "006", "pecas": 21140, "custo_medio": 1700000.00 } ],
  "saldo_atualizado_em": "2026-06-25T..." }
```

> ⚠️ Join **só por `produto`** (catálogo é global; `produtos.empresa` é multi-valor). Tipos `numeric`.

---

## 5. Validação esperada

Feita corretamente, a média móvel **converge para o `produtos.custo`** (o custo atual que o ERP
mantém) — então o **Custo Médio deve ficar próximo do Custo Atual** (que já bate 101% com o ERP).

Sanidade medida nos dados (loja 006, ~R$ 81/peça no ERP):
- Soma ingênua de todos os movimentos: R$ 126/peça (contaminado por R$ 1) ❌
- Só compras, soma simples (sem cronologia): R$ 47/peça (inclui compras antigas já vendidas) ❌
- **Média móvel cronológica das compras: deve cair em ~R$ 80/peça** ✅

Se o resultado vier muito abaixo (~R$ 40-50), provavelmente a cronologia/rotatividade não está
sendo aplicada (está somando compras antigas cujo estoque já saiu).

---

## 6. Como o painel consome

`src/services/estoque-custo-atual.service.ts` ganha um irmão `estoque-custo-medio.service.ts`
(mesma estrutura: chama o endpoint, mapeia `empresa|loja → lojaId`, cache 5min, resiliente).
O `dashboard.service` popula um campo `custoEstoqueMedioCY`, e o toggle do painel passa a ter o
**Médio real** (em vez do `EstoqueDiario` furado).

---

## 7. Resumo do pedido ao integrador

1. View **`custo_medio_produto`** — média móvel ponderada por produto, usando `compra = true`
   para as compras e ignorando o custo de vendas/transferências (§3).
2. Materializada e atualizada pelo ETL (full refresh + swap atômico).
3. Endpoint **`GET /api/estoque/custo-medio`** — `JOIN estoque_saldo × custo_medio_produto`,
   agregado por loja (§4), mesmo auth/contrato do custo atual.
4. Sanidade: resultado deve ficar próximo do `produtos.custo` / ERP (~R$ 80/peça na loja 006).
