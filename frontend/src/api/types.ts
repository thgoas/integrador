export interface Connection {
  id: number
  name: string
  type: 'mssql' | 'mysql' | 'postgres'
  host: string
  port: number | null
  database: string
  username: string | null
  created_at: string
}

export interface ConnectionInput {
  name: string
  type: string
  host: string
  port?: number
  database: string
  username?: string
  password?: string
}

export interface ApiConnection {
  id: number
  name: string
  base_url: string
  auth_type: 'none' | 'bearer' | 'apikey' | 'basic'
  auth_header: string | null
  headers: string | null
  created_at: string
}

export interface ApiConnectionInput {
  name: string
  base_url: string
  auth_type?: 'none' | 'bearer' | 'apikey' | 'basic'
  auth_header?: string
  auth_value?: string
  headers?: string
}

export interface Job {
  id: number
  name: string
  connection_id: number | null
  connection_name: string | null
  connection_type: string | null
  sql_template: string
  destination_table: string
  schema: string | null
  loja: string | null
  date_column: string | null
  code_column: string | null
  date_mode: 'fixed' | 'current_month' | 'last_month'
  date_from: string | null
  date_to: string | null
  window_size: string
  concurrency: number
  chunk_size: number
  status: 'idle' | 'running' | 'stopped'
  schedule_enabled: number
  schedule_cron: string | null
  monthly_reprocess: number
  source_type: 'db' | 'api'
  api_connection_id: number | null
  api_endpoint: string | null
  api_method: string | null
  api_data_path: string | null
  api_pagination_type: string | null
  api_page_param: string | null
  api_page_size: number | null
  api_next_path: string | null
  api_config: string | null
  webhook_url: string | null
  field_mapping: string | null
  last_run_id: number | null
  last_run_status: string | null
  last_run_at: string | null
  created_at: string
  updated_at: string
}

export interface JobInput {
  name: string
  connection_id?: number
  sql_template: string
  destination_table: string
  schema?: string
  loja?: string
  date_column?: string
  code_column?: string
  date_mode?: 'fixed' | 'current_month' | 'last_month'
  date_from?: string
  date_to?: string
  window_size?: string
  concurrency?: number
  chunk_size?: number
  schedule_enabled?: number
  schedule_cron?: string
  monthly_reprocess?: number
  source_type?: 'db' | 'api'
  api_connection_id?: number
  api_endpoint?: string
  api_method?: string
  api_data_path?: string
  api_pagination_type?: string
  api_page_param?: string
  api_page_size?: number
  api_next_path?: string
  api_config?: string
  webhook_url?: string
  field_mapping?: string
}

export interface Run {
  id: number
  job_id: number
  status: 'running' | 'success' | 'failed' | 'stopped'
  rows_read: number
  rows_written: number
  error_msg: string | null
  started_at: string
  finished_at: string | null
}

export interface ApiToken {
  id: number
  name: string
  last_used_at: string | null
  created_at: string
}

export interface RunLog {
  id: number
  run_id: number
  level: 'info' | 'warn' | 'error'
  message: string
  created_at: string
}
