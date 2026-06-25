import type { FastifyInstance } from 'fastify'
import { format } from 'date-fns'
import { destPool } from '../../config/destination.js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Catálogo de produtos EXPANDIDO: 1 linha por (produto, empresa).
// `produtos.empresa` é multi-valor ("abys, o&a") e `estoques`/`estoque_saldo`.empresa é
// single-valor ("abys"); o unnest do split por vírgula permite casar por empresa. Hoje o
// custo é o mesmo nas duas empresas; quando entrarem novas empresas com o mesmo código e
// custo próprio, cada uma vira linha separada no catálogo e casa só com o estoque dela.
const PRODUTOS_EXPANDIDO = `
  SELECT pr.produto, pr.custo, trim(emp) AS empresa
  FROM produtos pr,
       unnest(regexp_split_to_array(pr.empresa, ',')) AS emp
`

type Row = { empresa: string; loja: string; pecas: string; custo_atual: string }
const toData = (rows: Row[]) =>
  rows.map(r => ({
    empresa: r.empresa,
    loja: r.loja,
    pecas: Number(r.pecas),
    custo_atual: Number(r.custo_atual),
  }))

/**
 * Endpoint dedicado de custo atual de estoque.
 *
 * Caminho rápido (default): lê de `estoque_saldo` — saldo por (empresa, loja, produto)
 * pré-somado pelo ETL (npm run refresh-saldo) — e só faz JOIN com `produtos` + agrega
 * por loja. Responde em milissegundos.
 *
 * Fallback (scan direto em `estoques`): usado quando vem `data` histórica (saldo "a uma
 * data passada", que o snapshot não cobre) ou quando `estoque_saldo` ainda não existe.
 * Varre ~45,6M linhas — lento, mas correto.
 *
 * Ver SPEC-ENDPOINT-CUSTO-ATUAL.md.
 */
export async function estoqueRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { empresa?: string; loja?: string; data?: string }
  }>('/estoque/custo-atual', async (req, reply) => {
    const today = format(new Date(), 'yyyy-MM-dd')
    const dataRef = req.query.data && DATE_RE.test(req.query.data) ? req.query.data : today
    // YYYY-MM-DD compara lexicograficamente = cronologicamente.
    const wantHistorical = dataRef < today

    try {
      // --- Caminho rápido: estoque_saldo (saldo atual pré-somado) ---
      if (!wantHistorical) {
        const vals: unknown[] = []
        const conds: string[] = []
        if (req.query.empresa) { vals.push(req.query.empresa); conds.push(`s.empresa = $${vals.length}`) }
        if (req.query.loja)    { vals.push(req.query.loja);    conds.push(`s.loja = $${vals.length}`) }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''

        const sql = `
          SELECT s.empresa,
                 s.loja,
                 SUM(s.pecas)            AS pecas,
                 SUM(s.pecas * p.custo)  AS custo_atual,
                 MAX(s.atualizado_em)    AS saldo_atualizado_em
          FROM estoque_saldo s
          JOIN (${PRODUTOS_EXPANDIDO}) p
            ON p.produto = s.produto
           AND p.empresa = s.empresa
          ${where}
          GROUP BY s.empresa, s.loja
          HAVING SUM(s.pecas) > 0
          ORDER BY s.empresa, s.loja
        `
        try {
          const r = await destPool.query<Row & { saldo_atualizado_em: Date | null }>(sql, vals)
          return {
            data: toData(r.rows),
            data_referencia: dataRef,
            saldo_atualizado_em: r.rows[0]?.saldo_atualizado_em ?? null,
            fonte: 'saldo',
          }
        } catch (err: any) {
          // 42P01 = undefined_table → estoque_saldo ainda não materializada; cai no scan direto.
          if (err.code !== '42P01') throw err
        }
      }

      // --- Fallback: scan direto em estoques (data histórica ou sem saldo materializado) ---
      const vals: unknown[] = [dataRef]
      const conds: string[] = ['e.data <= $1::date']
      if (req.query.empresa) { vals.push(req.query.empresa); conds.push(`e.empresa = $${vals.length}`) }
      if (req.query.loja)    { vals.push(req.query.loja);    conds.push(`e.loja = $${vals.length}`) }

      const sql = `
        SELECT e.empresa,
               e.loja,
               SUM(e.qtde)              AS pecas,
               SUM(e.qtde * p.custo)    AS custo_atual
        FROM estoques e
        JOIN (${PRODUTOS_EXPANDIDO}) p
          ON p.produto = e.produto
         AND p.empresa = e.empresa
        WHERE ${conds.join(' AND ')}
        GROUP BY e.empresa, e.loja
        HAVING SUM(e.qtde) > 0
        ORDER BY e.empresa, e.loja
      `
      const r = await destPool.query<Row>(sql, vals)
      return {
        data: toData(r.rows),
        data_referencia: dataRef,
        saldo_atualizado_em: null,
        fonte: 'estoques',
      }
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })
}
