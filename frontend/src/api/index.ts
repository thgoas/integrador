import { request } from './http'
import type {
  Connection, ConnectionInput,
  ApiConnection, ApiConnectionInput,
  Job, JobInput,
  Run, RunLog,
  ApiToken,
  User,
} from './types'

export { getToken, setToken, clearToken, getIsAdmin } from './http'
export type { Connection, ConnectionInput, ApiConnection, ApiConnectionInput, Job, JobInput, Run, RunLog, ApiToken, User } from './types'

export const api = {
  auth: {
    login: (username: string, password: string) =>
      request<{ token: string; username: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    me: () =>
      request<{ username: string }>('/auth/me'),
    changePassword: (current_password: string, new_password: string) =>
      request<{ ok: boolean }>('/auth/password', {
        method: 'PUT',
        body: JSON.stringify({ current_password, new_password }),
      }),
  },

  connections: {
    list: () =>
      request<Connection[]>('/connections'),
    create: (data: ConnectionInput) =>
      request<{ id: number }>('/connections', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Partial<ConnectionInput>) =>
      request<{ ok: boolean }>(`/connections/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: number) =>
      request<{ ok: boolean }>(`/connections/${id}`, { method: 'DELETE' }),
    test: (id: number) =>
      request<{ ok: boolean; message?: string; error?: string }>(`/connections/${id}/test`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
  },

  jobs: {
    list: () =>
      request<Job[]>('/jobs'),
    get: (id: number) =>
      request<Job>(`/jobs/${id}`),
    create: (data: JobInput) =>
      request<{ id: number }>('/jobs', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Partial<JobInput>) =>
      request<{ ok: boolean }>(`/jobs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: number) =>
      request<{ ok: boolean }>(`/jobs/${id}`, { method: 'DELETE' }),
    start: (id: number) =>
      request<{ ok: boolean; run_id: number }>(`/jobs/${id}/start`, { method: 'POST', body: JSON.stringify({}) }),
    stop: (id: number) =>
      request<{ ok: boolean }>(`/jobs/${id}/stop`, { method: 'POST', body: JSON.stringify({}) }),
    reprocess: (id: number, date_from: string, date_to: string) =>
      request<{ ok: boolean; run_id: number }>(`/jobs/${id}/reprocess`, {
        method: 'POST',
        body: JSON.stringify({ date_from, date_to }),
      }),
    reprocessFailed: (id: number, run_id: number) =>
      request<{ ok: boolean; run_id: number; periods: number }>(`/jobs/${id}/reprocess-failed`, {
        method: 'POST',
        body: JSON.stringify({ run_id }),
      }),
  },

  runs: {
    listByJob: (jobId: number) =>
      request<Run[]>(`/jobs/${jobId}/runs`),
    get: (id: number) =>
      request<Run>(`/runs/${id}`),
    logs: (runId: number, after: number) =>
      request<{ logs: RunLog[]; status: string; rows_read: number; rows_written: number }>(
        `/runs/${runId}/logs?after=${after}`
      ),
  },

  apiConnections: {
    list: () =>
      request<ApiConnection[]>('/api-connections'),
    create: (data: ApiConnectionInput) =>
      request<{ id: number }>('/api-connections', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Partial<ApiConnectionInput>) =>
      request<{ ok: boolean }>(`/api-connections/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: number) =>
      request<{ ok: boolean }>(`/api-connections/${id}`, { method: 'DELETE' }),
    test: (id: number) =>
      request<{ ok: boolean; message?: string; error?: string }>(`/api-connections/${id}/test`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
  },

  users: {
    list: () => request<User[]>('/auth/users'),
    create: (username: string, password: string, is_admin: boolean) =>
      request<{ id: number; username: string; is_admin: number }>('/auth/users', {
        method: 'POST',
        body: JSON.stringify({ username, password, is_admin }),
      }),
    remove: (id: number) => request<{ ok: boolean }>(`/auth/users/${id}`, { method: 'DELETE' }),
  },

  tokens: {
    list: () => request<ApiToken[]>('/auth/tokens'),
    create: (name: string) => request<{ id: number; name: string; token: string }>('/auth/tokens', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
    revoke: (id: number) => request<{ ok: boolean }>(`/auth/tokens/${id}`, { method: 'DELETE' }),
  },

  data: {
    query: (table: string, params: {
      limit?: number; offset?: number;
      order_by?: string; order_dir?: string;
      group_by?: string; sum?: string; avg?: string;
      count?: string; min?: string; max?: string;
      [key: string]: string | number | undefined;
    } = {}) => {
      const qs = new URLSearchParams()
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== '') qs.set(k, String(v))
      }
      const q = qs.toString()
      return request<{ data: Record<string, any>[]; total: number; limit: number; offset: number }>(
        `/data/${encodeURIComponent(table)}${q ? `?${q}` : ''}`
      )
    },
  },
}
