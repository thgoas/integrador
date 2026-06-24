import { describe, it, expect } from 'vitest'
import { renderTemplate } from '../src/etl/template'

describe('renderTemplate', () => {
  it('substitui variáveis simples', () => {
    const sql = renderTemplate('SELECT * FROM t WHERE d BETWEEN {{data_inicio}} AND {{data_fim}}', {
      data_inicio: '2024-01-01',
      data_fim: '2024-01-31',
    })
    expect(sql).toBe('SELECT * FROM t WHERE d BETWEEN 2024-01-01 AND 2024-01-31')
  })

  it('substitui {{schema}}', () => {
    const out = renderTemplate('FROM {{schema}}.vendas', {
      data_inicio: 'x', data_fim: 'y', schema: 'dbo',
    })
    expect(out).toBe('FROM dbo.vendas')
  })

  it('renderiza {{loja}} único como lista SQL com aspas', () => {
    const out = renderTemplate('WHERE loja IN ({{loja}})', {
      data_inicio: 'x', data_fim: 'y', loja: '001',
    })
    expect(out).toBe("WHERE loja IN ('001')")
  })

  it('renderiza {{loja}} com vírgulas como lista SQL', () => {
    const out = renderTemplate('WHERE loja IN ({{loja}})', {
      data_inicio: 'x', data_fim: 'y', loja: '001,002,003',
    })
    expect(out).toBe("WHERE loja IN ('001', '002', '003')")
  })

  it('faz trim dos valores de {{loja}}', () => {
    const out = renderTemplate('{{loja}}', {
      data_inicio: 'x', data_fim: 'y', loja: ' 001 , 002 ',
    })
    expect(out).toBe("'001', '002'")
  })

  it('escapa aspas simples em {{loja}} (anti SQL-injection)', () => {
    const out = renderTemplate('{{loja}}', {
      data_inicio: 'x', data_fim: 'y', loja: "0'1",
    })
    expect(out).toBe("'0''1'")
  })

  it('substitui múltiplas ocorrências da mesma variável', () => {
    const out = renderTemplate('{{data_inicio}} .. {{data_inicio}}', {
      data_inicio: '2024-01-01', data_fim: 'y',
    })
    expect(out).toBe('2024-01-01 .. 2024-01-01')
  })

  it('lança erro quando a variável não foi fornecida', () => {
    expect(() => renderTemplate('{{loja}}', { data_inicio: 'x', data_fim: 'y' }))
      .toThrowError(/\{\{loja\}\}/)
  })

  it('não toca em texto sem variáveis', () => {
    const out = renderTemplate('SELECT 1', { data_inicio: 'x', data_fim: 'y' })
    expect(out).toBe('SELECT 1')
  })
})
