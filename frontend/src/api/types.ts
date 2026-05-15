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

export interface Job {
  id: number
  name: string
  connection_id: number
  connection_name: string
  connection_type: string
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
  last_run_id: number | null
  last_run_status: string | null
  last_run_at: string | null
  created_at: string
  updated_at: string
}

export interface JobInput {
  name: string
  connection_id: number
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

export interface RunLog {
  id: number
  run_id: number
  level: 'info' | 'warn' | 'error'
  message: string
  created_at: string
}
