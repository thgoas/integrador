// Map<runId, Set<sendFn>> — live SSE subscribers per run
export const sseClients = new Map<number, Set<(data: object) => void>>()

export function broadcastLog(runId: number, data: object) {
  sseClients.get(runId)?.forEach(send => send(data))
}
