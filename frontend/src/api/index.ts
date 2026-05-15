import { request } from './http'
import type {
  Connection, ConnectionInput,
  Job, JobInput,
  Run, RunLog,
} from './types'

export { getToken, setToken, clearToken } from './http'
export type { Connection, ConnectionInput, Job, JobInput, Run, RunLog } from './types'

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
}
