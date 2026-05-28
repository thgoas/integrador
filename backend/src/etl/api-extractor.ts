import { getDb } from '../db/sqlite.js'
import { decrypt } from '../db/crypto.js'

function getAtPath(obj: any, path: string): any {
  if (!path) return obj
  return path.split('.').reduce((o: any, k: string) => (o != null ? o[k] : undefined), obj)
}

interface ApiConnectionRow {
  id: number
  base_url: string
  auth_type: string
  auth_header: string | null
  auth_value: string | null
  headers: string | null
}

export interface ApiExtractOptions {
  method: string
  body: string | null
  data_path: string
  pagination_type: string
  page_param: string
  page_size: number
  next_path: string | null
  api_config: Record<string, any>
}

export async function* extractApiChunked(
  apiConnectionId: number,
  endpoint: string,
  options: ApiExtractOptions,
  chunkSize: number
): AsyncGenerator<Record<string, any>[]> {
  const db = getDb()
  const conn = db.prepare('SELECT * FROM api_connections WHERE id = ?').get(apiConnectionId) as unknown as ApiConnectionRow
  if (!conn) throw new Error(`Conexão API ${apiConnectionId} não encontrada`)

  const headers: Record<string, string> = { Accept: 'application/json' }

  if (conn.headers) {
    try { Object.assign(headers, JSON.parse(conn.headers)) } catch {}
  }

  const authValue = conn.auth_value ? decrypt(conn.auth_value) : ''
  if (conn.auth_type === 'bearer') {
    headers['Authorization'] = `Bearer ${authValue}`
  } else if (conn.auth_type === 'apikey') {
    headers[conn.auth_header ?? 'X-API-Key'] = authValue
  } else if (conn.auth_type === 'basic') {
    headers['Authorization'] = `Basic ${Buffer.from(authValue).toString('base64')}`
  }

  const method = (options.method ?? 'GET').toUpperCase()
  const isPost = method === 'POST' || method === 'PUT' || method === 'PATCH'
  if (isPost) headers['Content-Type'] = 'application/json'

  const baseUrl = conn.base_url.replace(/\/$/, '')
  const epPath = endpoint.startsWith('/') || endpoint.startsWith('?') ? endpoint : `/${endpoint}`
  const fullUrl = baseUrl + epPath

  const { data_path, pagination_type = 'none', page_param = 'page', page_size = 100, next_path, api_config } = options

  const doFetch = async (url: string, body?: string): Promise<any> => {
    const res = await fetch(url, {
      method,
      headers,
      body: isPost ? (body ?? null) : undefined,
      signal: AbortSignal.timeout(60000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`API ${res.status}: ${text.slice(0, 300)}`)
    }
    return res.json()
  }

  const buildBody = (rawBody: string | null, extraVars?: Record<string, any>): string | undefined => {
    if (!rawBody) return undefined
    if (api_config.graphql) {
      return JSON.stringify({
        query: rawBody,
        variables: { ...(api_config.variables ?? {}), ...extraVars },
      })
    }
    return rawBody
  }

  const extractRows = (data: any): Record<string, any>[] => {
    const rows = data_path ? getAtPath(data, data_path) : data
    return Array.isArray(rows) ? rows : []
  }

  function* yieldChunks(rows: Record<string, any>[]): Iterable<Record<string, any>[]> {
    for (let i = 0; i < rows.length; i += chunkSize) {
      yield rows.slice(i, i + chunkSize)
    }
  }

  if (pagination_type === 'none') {
    const data = await doFetch(fullUrl, buildBody(options.body))
    yield* yieldChunks(extractRows(data))
  } else if (pagination_type === 'page') {
    const pageSizeParam = api_config.page_size_param ?? 'limit'
    let page = Number(api_config.first_page ?? 1)
    while (true) {
      const sep = fullUrl.includes('?') ? '&' : '?'
      const url = `${fullUrl}${sep}${page_param}=${page}&${pageSizeParam}=${page_size}`
      const data = await doFetch(url, buildBody(options.body))
      const rows = extractRows(data)
      if (rows.length === 0) break
      yield* yieldChunks(rows)
      if (rows.length < page_size) break
      page++
    }
  } else if (pagination_type === 'offset') {
    const offsetParam = api_config.offset_param ?? 'offset'
    const limitParam = api_config.limit_param ?? 'limit'
    let offset = 0
    while (true) {
      const sep = fullUrl.includes('?') ? '&' : '?'
      const url = `${fullUrl}${sep}${offsetParam}=${offset}&${limitParam}=${page_size}`
      const data = await doFetch(url, buildBody(options.body))
      const rows = extractRows(data)
      if (rows.length === 0) break
      yield* yieldChunks(rows)
      if (rows.length < page_size) break
      offset += page_size
    }
  } else if (pagination_type === 'cursor') {
    let cursor: string | null = null
    while (true) {
      let url = fullUrl
      if (cursor !== null) {
        const sep = url.includes('?') ? '&' : '?'
        url = `${url}${sep}${page_param}=${encodeURIComponent(cursor)}`
      }
      const data = await doFetch(url, buildBody(options.body, cursor !== null ? { [page_param]: cursor } : undefined))
      const rows = extractRows(data)
      if (rows.length === 0) break
      yield* yieldChunks(rows)
      cursor = next_path ? (getAtPath(data, next_path) ?? null) : null
      if (cursor === null) break
    }
  }
}
