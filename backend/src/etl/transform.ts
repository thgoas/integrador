export interface MappingConfig {
  select?: string[]
  rename?: Record<string, string>
  cast?: Record<string, 'number' | 'integer' | 'date' | 'boolean' | 'string' | 'json'>
  fixed?: Record<string, unknown>
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

export function applyMapping(
  rows: Record<string, any>[],
  config: MappingConfig
): Record<string, any>[] {
  if (!rows.length) return rows

  const { select, rename = {}, cast = {}, fixed = {} } = config

  return rows.map(row => {
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

    return mapped
  })
}
