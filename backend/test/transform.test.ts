import { describe, it, expect } from 'vitest'
import { applyMapping, resolveColumnTypes, runTransformScript } from '../src/etl/transform'

describe('applyMapping — select', () => {
  it('mantém apenas os campos da whitelist', () => {
    const out = applyMapping([{ a: 1, b: 2, c: 3 }], { select: ['a', 'c'] })
    expect(out).toEqual([{ a: 1, c: 3 }])
  })

  it('ignora campos do select que não existem na linha', () => {
    const out = applyMapping([{ a: 1 }], { select: ['a', 'inexistente'] })
    expect(out).toEqual([{ a: 1 }])
  })

  it('sem select, mantém todos os campos', () => {
    const out = applyMapping([{ a: 1, b: 2 }], {})
    expect(out).toEqual([{ a: 1, b: 2 }])
  })

  it('retorna o mesmo array quando vazio', () => {
    const rows: any[] = []
    expect(applyMapping(rows, { select: ['a'] })).toBe(rows)
  })
})

describe('applyMapping — rename', () => {
  it('renomeia campos da origem para o destino', () => {
    const out = applyMapping([{ id_pedido: 7, valor_bruto: 10 }], {
      rename: { id_pedido: 'pedido_id', valor_bruto: 'valor' },
    })
    expect(out).toEqual([{ pedido_id: 7, valor: 10 }])
  })
})

describe('applyMapping — cast', () => {
  it('number: converte string numérica e anula inválidos', () => {
    const out = applyMapping([{ v: '12.5' }, { v: 'abc' }], { cast: { v: 'number' } })
    expect(out).toEqual([{ v: 12.5 }, { v: null }])
  })

  it('integer: trunca decimais', () => {
    const out = applyMapping([{ v: '12.9' }], { cast: { v: 'integer' } })
    expect(out).toEqual([{ v: 12 }])
  })

  it('date: vira ISO string UTC', () => {
    const out = applyMapping([{ d: '2024-01-15' }], { cast: { d: 'date' } })
    expect(out).toEqual([{ d: '2024-01-15T00:00:00.000Z' }])
  })

  it('boolean: usa a whitelist de valores verdadeiros', () => {
    const out = applyMapping(
      [{ v: 'sim' }, { v: '1' }, { v: 'true' }, { v: 'não' }, { v: '0' }],
      { cast: { v: 'boolean' } },
    )
    expect(out.map(r => r.v)).toEqual([true, true, true, false, false])
  })

  it('json: faz parse de string e mantém objeto', () => {
    const out = applyMapping([{ v: '{"a":1}' }, { v: { b: 2 } }], { cast: { v: 'json' } })
    expect(out).toEqual([{ v: { a: 1 } }, { v: { b: 2 } }])
  })

  it('valor null permanece null', () => {
    const out = applyMapping([{ v: null }], { cast: { v: 'number' } })
    expect(out).toEqual([{ v: null }])
  })

  it('cast usa o nome de destino (pós-rename)', () => {
    const out = applyMapping([{ x: '5' }], {
      rename: { x: 'qtd' },
      cast: { qtd: 'integer' },
    })
    expect(out).toEqual([{ qtd: 5 }])
  })
})

describe('applyMapping — fixed e ordem de aplicação', () => {
  it('adiciona campos fixos a todas as linhas', () => {
    const out = applyMapping([{ a: 1 }, { a: 2 }], { fixed: { sistema: 'ERP' } })
    expect(out).toEqual([{ a: 1, sistema: 'ERP' }, { a: 2, sistema: 'ERP' }])
  })

  it('fixed sobrescreve o valor após o cast', () => {
    const out = applyMapping([{ v: '1' }], { cast: { v: 'number' }, fixed: { v: 99 } })
    expect(out).toEqual([{ v: 99 }])
  })
})

describe('applyMapping — concat', () => {
  it('combina campos já mapeados via {{campo}}', () => {
    const out = applyMapping([{ loja: '001', pedido: 50 }], {
      concat: { chave: '{{loja}}-{{pedido}}' },
    })
    expect(out).toEqual([{ loja: '001', pedido: 50, chave: '001-50' }])
  })

  it('campos inexistentes viram string vazia', () => {
    const out = applyMapping([{ a: 'x' }], { concat: { k: '{{a}}/{{faltante}}' } })
    expect(out).toEqual([{ a: 'x', k: 'x/' }])
  })
})

describe('applyMapping — explode', () => {
  it('explode array de objetos em linhas, mesclando com o pai', () => {
    const out = applyMapping(
      [{ pedido: 1, itens: [{ sku: 'a' }, { sku: 'b' }] }],
      { explode: 'itens' },
    )
    expect(out).toEqual([
      { pedido: 1, sku: 'a' },
      { pedido: 1, sku: 'b' },
    ])
  })

  it('linha sem array mantém o pai e remove o campo', () => {
    const out = applyMapping([{ pedido: 2, itens: null }], { explode: 'itens' })
    expect(out).toEqual([{ pedido: 2 }])
  })
})

describe('resolveColumnTypes', () => {
  it('deriva o tipo da coluna a partir do cast', () => {
    expect(resolveColumnTypes({ cast: { codigo: 'string', qtd: 'integer', preco: 'number' } }))
      .toEqual({ codigo: 'text', qtd: 'bigint', preco: 'numeric' })
  })

  it('types tem prioridade sobre o derivado do cast', () => {
    expect(resolveColumnTypes({ cast: { ean: 'number' }, types: { ean: 'text' } }))
      .toEqual({ ean: 'text' })
  })

  it('config vazia retorna objeto vazio', () => {
    expect(resolveColumnTypes({})).toEqual({})
  })
})

describe('runTransformScript', () => {
  it('executa o script e retorna o array transformado', () => {
    const out = runTransformScript(
      [{ preco: 10, custo: 4 }],
      'return rows.map(r => ({ ...r, margem: r.preco - r.custo }))',
    )
    expect(out).toEqual([{ preco: 10, custo: 4, margem: 6 }])
  })

  it('lança erro quando o script não retorna array', () => {
    expect(() => runTransformScript([{ a: 1 }], 'return 42'))
      .toThrowError(/array/)
  })
})
