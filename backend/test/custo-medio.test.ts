import { describe, it, expect } from 'vitest'
import { CustoMedioAccumulator, custoMedioFinal } from '../src/etl/custo-medio'

describe('custoMedioFinal — média móvel ponderada', () => {
  it('uma compra: custo médio = custo unitário da compra', () => {
    // 10 peças a R$ 5 (total 50) → cm = 5
    expect(custoMedioFinal([{ qtde: 10, compra: true, custoLinhaTotal: 50 }])).toBe(5)
  })

  it('duas compras: pondera pela quantidade', () => {
    // 10@5 (50) + 10@7 (70) = 120 / 20 = 6
    const cm = custoMedioFinal([
      { qtde: 10, compra: true, custoLinhaTotal: 50 },
      { qtde: 10, compra: true, custoLinhaTotal: 70 },
    ])
    expect(cm).toBe(6)
  })

  it('venda não muda o custo médio (custo da saída é ignorado)', () => {
    // compra 10@10 (cm=10); vende 5 com custo placeholder R$1 → cm continua 10
    const cm = custoMedioFinal([
      { qtde: 10, compra: true, custoLinhaTotal: 100 },
      { qtde: -5, compra: false, custoLinhaTotal: 1 }, // placeholder ignorado
    ])
    expect(cm).toBe(10)
  })

  it('venda intermediária altera o saldo e, logo, a ponderação da próxima compra', () => {
    // compra 10@10 (cm=10); vende 5 (saldo=5, cm=10); compra 5@20 → (5*10 + 5*20)/10 = 15
    const cm = custoMedioFinal([
      { qtde: 10, compra: true, custoLinhaTotal: 100 },
      { qtde: -5, compra: false, custoLinhaTotal: 1 },
      { qtde: 5, compra: true, custoLinhaTotal: 100 },
    ])
    expect(cm).toBe(15)
  })

  it('sem a venda, a mesma sequência de compras pondera diferente', () => {
    // compra 10@10 + compra 5@20 sem venda → (100+100)/15 = 13.333...
    const cm = custoMedioFinal([
      { qtde: 10, compra: true, custoLinhaTotal: 100 },
      { qtde: 5, compra: true, custoLinhaTotal: 100 },
    ])
    expect(cm).toBeCloseTo(13.3333, 4)
  })

  it('só vendas (sem compra): custo médio fica 0', () => {
    expect(custoMedioFinal([{ qtde: -3, compra: false, custoLinhaTotal: 1 }])).toBe(0)
  })

  it('converge para o custo da última compra quando tudo é reposto a esse custo', () => {
    // compra 10@8 (cm=8); vende tudo (saldo 0, cm=8); compra 10@8 → cm=8
    const cm = custoMedioFinal([
      { qtde: 10, compra: true, custoLinhaTotal: 80 },
      { qtde: -10, compra: false, custoLinhaTotal: 1 },
      { qtde: 10, compra: true, custoLinhaTotal: 80 },
    ])
    expect(cm).toBe(8)
  })
})

describe('CustoMedioAccumulator — fronteiras de produto', () => {
  it('fecha um resultado por (empresa, produto) na ordem do stream', () => {
    const acc = new CustoMedioAccumulator()
    acc.push('abys', '100', 10, true, 100) // cm 10
    acc.push('abys', '100', -2, false, 1)  // cm 10
    acc.push('abys', '200', 5, true, 25)   // novo produto → fecha 100, cm 5
    acc.push('o&a', '100', 4, true, 40)    // nova empresa → fecha 200, cm 10
    const out = acc.finish()
    expect(out).toEqual([
      { empresa: 'abys', produto: '100', custo_medio: 10 },
      { empresa: 'abys', produto: '200', custo_medio: 5 },
      { empresa: 'o&a', produto: '100', custo_medio: 10 },
    ])
  })

  it('finish sem nenhum push devolve vazio', () => {
    expect(new CustoMedioAccumulator().finish()).toEqual([])
  })
})
