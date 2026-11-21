// Azimara Mesh TypeScript SDK — mirrors docs/engineering/openapi-v1.yaml.
export interface MeshClientOptions {
  baseUrl?: string
  apiKey: string
  fetch?: typeof fetch
}

export interface Agent {
  id: string
  name: string
  slug: string
  status: string
  currentVersion: string
}

export interface Execution {
  id: string
  status: string
  kind: string
  startedAt: string
}

export interface Page<T> {
  data: T[]
  pagination: { hasMore: boolean; nextCursor: string | null }
}

export class MeshError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
  }
}

export class MeshClient {
  private baseUrl: string
  private fetchFn: typeof fetch

  constructor(private options: MeshClientOptions) {
    this.baseUrl = (options.baseUrl ?? 'https://mesh.aiazimara.com/api/v1').replace(/\/$/, '')
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis)
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.options.apiKey}`,
        ...(init.headers ?? {}),
      },
    })
    const body = await res.json() as T & { error?: { code: string; message: string } }
    if (!res.ok) throw new MeshError(res.status, body.error?.code ?? 'UNKNOWN', body.error?.message ?? res.statusText)
    return body
  }

  listAgents(params: { limit?: number; cursor?: string } = {}): Promise<Page<Agent>> {
    const q = new URLSearchParams()
    if (params.limit) q.set('limit', String(params.limit))
    if (params.cursor) q.set('cursor', params.cursor)
    return this.request(`/agents${q.size ? `?${q}` : ''}`)
  }

  listExecutions(params: { limit?: number; cursor?: string; status?: string } = {}): Promise<Page<Execution>> {
    const q = new URLSearchParams()
    if (params.limit) q.set('limit', String(params.limit))
    if (params.cursor) q.set('cursor', params.cursor)
    if (params.status) q.set('status', params.status)
    return this.request(`/executions${q.size ? `?${q}` : ''}`)
  }

  startExecution(agentId: string, input: Record<string, unknown> = {}): Promise<{ id: string; status: string }> {
    return this.request('/executions', {
      method: 'POST',
      body: JSON.stringify({ agentId, input }),
    })
  }

  cancelExecution(id: string): Promise<{ id: string; status: string }> {
    return this.request(`/executions/${encodeURIComponent(id)}/cancel`, { method: 'POST' })
  }
}
