import { describe, it, expect } from 'vitest'
import { generatePeriods } from '../src/etl/periods'

describe('generatePeriods — day', () => {
  it('gera um período por dia, inclusivo nas bordas', () => {
    const p = generatePeriods('2024-05-01', '2024-05-03', 'day')
    expect(p).toEqual([
      { from: '2024-05-01', to: '2024-05-01' },
      { from: '2024-05-02', to: '2024-05-02' },
      { from: '2024-05-03', to: '2024-05-03' },
    ])
  })

  it('dia único: from e to iguais', () => {
    expect(generatePeriods('2024-05-10', '2024-05-10', 'day'))
      .toEqual([{ from: '2024-05-10', to: '2024-05-10' }])
  })

  it('atravessa o 29 de fevereiro em ano bissexto', () => {
    const p = generatePeriods('2024-02-27', '2024-03-01', 'day')
    expect(p.map(x => x.from)).toEqual(['2024-02-27', '2024-02-28', '2024-02-29', '2024-03-01'])
  })
})

describe('generatePeriods — month', () => {
  it('recorta o primeiro e o último mês ao intervalo pedido', () => {
    const p = generatePeriods('2024-01-15', '2024-03-10', 'month')
    expect(p).toEqual([
      { from: '2024-01-15', to: '2024-01-31' }, // início recortado
      { from: '2024-02-01', to: '2024-02-29' }, // mês cheio (bissexto)
      { from: '2024-03-01', to: '2024-03-10' }, // fim recortado
    ])
  })

  it('mês único dentro do mesmo mês', () => {
    expect(generatePeriods('2024-06-05', '2024-06-20', 'month'))
      .toEqual([{ from: '2024-06-05', to: '2024-06-20' }])
  })

  it('atravessa virada de ano', () => {
    const p = generatePeriods('2023-12-10', '2024-01-05', 'month')
    expect(p).toEqual([
      { from: '2023-12-10', to: '2023-12-31' },
      { from: '2024-01-01', to: '2024-01-05' },
    ])
  })
})

describe('generatePeriods — week', () => {
  it('gera semanas começando na segunda-feira', () => {
    // 2024-01-01 é segunda; 2024-01-14 é domingo
    const p = generatePeriods('2024-01-01', '2024-01-14', 'week')
    expect(p).toEqual([
      { from: '2024-01-01', to: '2024-01-07' },
      { from: '2024-01-08', to: '2024-01-14' },
    ])
  })

  it('recorta semanas parciais nas bordas do intervalo', () => {
    // 2024-01-03 é quarta; 2024-01-09 é terça
    const p = generatePeriods('2024-01-03', '2024-01-09', 'week')
    expect(p).toEqual([
      { from: '2024-01-03', to: '2024-01-07' }, // início recortado p/ quarta
      { from: '2024-01-08', to: '2024-01-09' }, // fim recortado p/ terça
    ])
  })
})
