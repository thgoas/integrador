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

    // JOIN APENAS por produto (ver seção 4 da spec). `produtos` é catálogo global:
    // 1 linha por produto, com empresa multi-valor ("abys, o&a") e custo único. Já
    // `estoques.empresa` é single-valor — casar por empresa ("abys, o&a" = "abys")
    // descartaria TODAS as linhas (resultado vazio). O escopo por empresa vem de estoques.
    const sql = `
      SELECT e.empresa,
             e.loja,
             SUM(e.qtde)              AS pecas,
             SUM(e.qtde * p.custo)    AS custo_atual
      FROM estoques e
      JOIN produtos p
        ON p.produto = e.produto
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
