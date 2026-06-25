import type { FastifyInstance } from 'fastify'
import { format } from 'date-fns'
import { destPool } from '../../config/destination.js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Endpoint dedicado de custo atual de estoque.
 * Faz o JOIN estoques × produtos e agrega no banco, devolvendo ~1 linha por (empresa, loja)
 * em vez de paginar milhões de linhas por HTTP (o que estourava 504 no endpoint genérico).
 * Ver SPEC-ENDPOINT-CUSTO-ATUAL.md.
 */
export async function estoqueRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { empresa?: string; loja?: string; data?: string }
  }>('/estoque/custo-atual', async (req, reply) => {
    // `data` = saldo "a esta data" (data <= valor). Default = hoje.
    const dataRef = req.query.data && DATE_RE.test(req.query.data)
      ? req.query.data
      : format(new Date(), 'yyyy-MM-dd')

    const conditions: string[] = ['e.data <= $1::date']
    const values: unknown[] = [dataRef]

    // Filtros opcionais — sempre parametrizados.
    if (req.query.empresa) {
      values.push(req.query.empresa)
      conditions.push(`e.empresa = $${values.length}`)
    }
    if (req.query.loja) {
      values.push(req.query.loja)
      conditions.push(`e.loja = $${values.length}`)
    }

    // JOIN por (produto, empresa) com o catálogo EXPANDIDO por empresa.
    // `produtos.empresa` é multi-valor ("abys, o&a") e `estoques.empresa` é single-valor
    // ("abys"), então um equi-join direto ("abys, o&a" = "abys") descartaria tudo (data: []).
    // A subquery expande cada produto em 1 linha por empresa (unnest do split por vírgula),
    // permitindo casar por empresa. Hoje "abys, o&a" → 2 linhas com o mesmo custo (resultado
    // idêntico ao de casar só por produto); no futuro, o mesmo código pode pertencer a outra
    // empresa com custo próprio (linha separada no catálogo) e casa só com o estoque dela.
    const sql = `
      SELECT e.empresa,
             e.loja,
             SUM(e.qtde)              AS pecas,
             SUM(e.qtde * p.custo)    AS custo_atual
      FROM estoques e
      JOIN (
        SELECT pr.produto,
               pr.custo,
               trim(emp) AS empresa
        FROM produtos pr,
             unnest(regexp_split_to_array(pr.empresa, ',')) AS emp
      ) p
        ON p.produto = e.produto
       AND p.empresa = e.empresa
      WHERE ${conditions.join(' AND ')}
      GROUP BY e.empresa, e.loja
      HAVING SUM(e.qtde) > 0
      ORDER BY e.empresa, e.loja
    `

    try {
      const result = await destPool.query<{
        empresa: string
        loja: string
        pecas: string
        custo_atual: string
      }>(sql, values)

      return {
        data: result.rows.map(r => ({
          empresa: r.empresa,
          loja: r.loja,
          pecas: Number(r.pecas),
          custo_atual: Number(r.custo_atual),
        })),
        data_referencia: dataRef,
      }
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })
}
