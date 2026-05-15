export interface TemplateVars {
  data_inicio: string
  data_fim: string
  loja?: string
  schema?: string
  [key: string]: string | undefined
}

// Formats a comma-separated value as a SQL quoted list: "001,002,003" → "'001', '002', '003'"
function toSqlList(value: string): string {
  return value
    .split(',')
    .map(v => `'${v.trim().replace(/'/g, "''")}'`)
    .join(', ')
}

export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = vars[key]
    if (val === undefined) throw new Error(`Template variable "{{${key}}}" not provided`)

    // {{loja}} always renders as a SQL-safe quoted list (works for both single and multiple values)
    if (key === 'loja') return toSqlList(val)

    return val
  })
}
