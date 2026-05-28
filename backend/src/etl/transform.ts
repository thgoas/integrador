import vm from 'node:vm'

export interface MappingConfig {
  select?: string[]
  rename?: Record<string, string>
  cast?: Record<string, 'number' | 'integer' | 'date' | 'boolean' | 'string' | 'json'>
  fixed?: Record<string, unknown>
  /** Cria colunas combinando texto fixo com valores de campos via {{campo}} */
  concat?: Record<string, string>
  /** Nome do campo array a ser "explodido" em linhas separadas (só API) */
  explode?: string
}

const TRUTHY = new Set(['true', '1', 'yes', 'sim', 's', 'y'])

function castValue(value: unknown, type: NonNullable<MappingConfig['cast']>[string]): unknown {
  if (value === null || value === undefined) return null
  try {
    switch (type) {
      case 'number': {
        const n = parseFloat(String(value))
        return isNaN(n) ? null : n
      }
      case 'integer': {
        const n = parseInt(String(value), 10)
        return isNaN(n) ? null : n
      }
      case 'date': {
        const d = new Date(String(value))
        return isNaN(d.getTime()) ? null : d.toISOString()
      }
      case 'boolean':
        return TRUTHY.has(String(value).toLowerCase())
      case 'string':
        return String(value)
      case 'json':
        return typeof value === 'string' ? JSON.parse(value) : value
      default:
        return value
    }
  } catch {
    return null
  }
}

/** Substitui {{campo}} pelo valor do campo na row. Campos inexistentes viram string vazia. */
function renderConcat(template: string, row: Record<string, any>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = row[key]
    return v === null || v === undefined ? '' : String(v)
  })
}

export function applyMapping(
  rows: Record<string, any>[],
  config: MappingConfig
): Record<string, any>[] {
  if (!rows.length) return rows

  const { select, rename = {}, cast = {}, fixed = {}, concat = {}, explode } = config

  const transformed = rows.map(row => {
    // 1. select: choose which source fields to keep
    const sourceKeys = select ? select.filter(k => k in row) : Object.keys(row)

    // 2. rename + build new row
    const mapped: Record<string, any> = {}
    for (const srcKey of sourceKeys) {
      const destKey = rename[srcKey] ?? srcKey
      mapped[destKey] = row[srcKey]
    }

    // 3. cast destination columns
    for (const [col, type] of Object.entries(cast)) {
      if (col in mapped) {
        mapped[col] = castValue(mapped[col], type)
      }
    }

    // 4. fixed values
    for (const [col, value] of Object.entries(fixed)) {
      mapped[col] = value
    }

    // 5. concat: cria colunas combinando texto fixo + valores de campos via {{campo}}
    for (const [destCol, template] of Object.entries(concat)) {
      mapped[destCol] = renderConcat(template, mapped)
    }

    return mapped
  })

  // 6. explode: normaliza array aninhado em linhas separadas
  if (explode) {
    const exploded: Record<string, any>[] = []
    for (const row of transformed) {
      const arr = row[explode]
      if (Array.isArray(arr) && arr.length > 0) {
        // Remove o campo array do pai e mescla com cada item filho
        const parent = { ...row }
        delete parent[explode]
        for (const item of arr) {
          exploded.push({ ...parent, ...(typeof item === 'object' && item !== null ? item : { [explode]: item }) })
        }
      } else {
        // Não é array ou está vazio: mantém a linha original (sem o campo)
        const parent = { ...row }
        delete parent[explode]
        exploded.push(parent)
      }
    }
    return exploded
  }

  return transformed
}

/**
 * Executa um script JS fornecido pelo usuário para transformar rows.
 * O script recebe `rows` (array de objetos) e deve retornar o array transformado.
 *
 * Exemplo de script:
 *   return rows.map(row => ({ ...row, margem: row.preco - row.custo }))
 *
 * Executado em sandbox via node:vm com timeout de 5s.
 * Sem acesso a require, process ou I/O.
 */
export function runTransformScript(
  rows: Record<string, any>[],
  script: string
): Record<string, any>[] {
  const ctx = vm.createContext({ rows, result: null })
  const code = `result = (function(rows) { ${script} })(rows)`
  vm.runInContext(code, ctx, { timeout: 5000 })
  if (!Array.isArray(ctx.result)) {
    throw new Error('O script de transformação deve retornar um array de objetos')
  }
  return ctx.result as Record<string, any>[]
}
