CREATE TABLE IF NOT EXISTS connections (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK(type IN ('mssql','mysql','postgres')),
  host        TEXT NOT NULL,
  port        INTEGER,
  database    TEXT NOT NULL,
  username    TEXT,
  password    TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jobs (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  name                TEXT NOT NULL,
  connection_id       INTEGER REFERENCES connections(id) ON DELETE SET NULL,
  sql_template        TEXT NOT NULL,
  destination_table   TEXT NOT NULL,
  schema              TEXT,
  loja                TEXT,
  date_mode           TEXT NOT NULL DEFAULT 'fixed' CHECK(date_mode IN ('fixed','current_month','last_month')),
  date_from           DATE,
  date_to             DATE,
  window_size         TEXT NOT NULL DEFAULT 'month' CHECK(window_size IN ('day','week','month')),
  concurrency         INTEGER NOT NULL DEFAULT 4,
  chunk_size          INTEGER NOT NULL DEFAULT 5000,
  date_column         TEXT,
  status              TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle','running','stopped')),
  schedule_enabled    INTEGER NOT NULL DEFAULT 0,
  schedule_cron       TEXT,
  monthly_reprocess   INTEGER NOT NULL DEFAULT 0,
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id       INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','success','failed','stopped')),
  rows_read    INTEGER NOT NULL DEFAULT 0,
  rows_written INTEGER NOT NULL DEFAULT 0,
  error_msg    TEXT,
  started_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  finished_at  DATETIME
);

CREATE TABLE IF NOT EXISTS run_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id     INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  level      TEXT NOT NULL DEFAULT 'info' CHECK(level IN ('info','warn','error')),
  message    TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT NOT NULL UNIQUE,
  password    TEXT NOT NULL,
  is_admin    INTEGER NOT NULL DEFAULT 0,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS api_connections (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  base_url    TEXT NOT NULL,
  auth_type   TEXT NOT NULL DEFAULT 'none',
  auth_header TEXT,
  auth_value  TEXT,
  headers     TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_runs_job_id ON runs(job_id);
CREATE INDEX IF NOT EXISTS idx_run_logs_run_id ON run_logs(run_id);
