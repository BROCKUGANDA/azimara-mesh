'use client'

import { useApi } from '@/lib/client'
import { PageHeader, Section, StatusChip, ErrorNote, LoadingBlock } from '@/components/mesh/kit'
import { useState } from 'react'

const ENDPOINTS: [string, string, string][] = [
  ['POST', '/api/executions', 'Start a governed agent or workflow run. Returns an executionId; runs are async with policy, budget and identity checks applied before any model call.'],
  ['GET', '/api/executions/{id}', 'Fetch execution status, trace spans, redacted tool calls and policy decisions. Poll while running.'],
  ['POST', '/api/executions/{id}', 'Cancel a running execution or start a safe replay (external side effects suppressed).'],
  ['GET', '/api/agents', 'List registered agents with status, versions, spend and health.'],
  ['POST', '/api/agents', 'Register an agent from a manifest (any framework). Creates a DRAFT with a workload identity.'],
  ['POST', '/api/agents/{id}', 'Lifecycle actions: publish, rollback, pause, resume, retire.'],
  ['GET', '/api/policies', 'Policy inventory with deterministic rules.'],
  ['POST', '/api/policies', 'Create/update policies, or run a simulation (op=simulate) that returns the exact decision path.'],
  ['GET', '/api/approvals', 'List pending human approvals (tool usage, deployments, financial ops).'],
  ['POST', '/api/approvals/{id}', 'Decide an approval: approve or reject, with a note. Resumes the checkpointed execution.'],
  ['GET', '/api/usage', 'Metered usage breakdowns: by agent, model, tool and kind, with budget forecast.'],
  ['GET', '/api/audit', 'Query the immutable audit trail by action and severity.'],
]

const TS_SNIPPET = `import { ZAI } from 'z-ai-web-dev-sdk' // not required — this calls the Mesh API

const MESH = 'https://<your-deployment>'
const headers = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer <api key>',
  'x-workspace-id': '<workspace id>',
}

// 1. start a governed run
const { executionId } = await fetch(MESH + '/api/executions', {
  method: 'POST', headers,
  body: JSON.stringify({
    kind: 'agent',
    agentId: '<agent id>',
    input: { prompt: 'Summarize the latest incident report' },
  }),
}).then(r => r.json())

// 2. poll for the trace
const detail = await fetch(MESH + '/api/executions/' + executionId, { headers })
  .then(r => r.json())
console.log(detail.execution.status, detail.spans.length, 'spans')`

const PY_SNIPPET = `import requests

MESH = "https://<your-deployment>"
H = {"Authorization": "Bearer <api key>", "x-workspace-id": "<workspace id>"}

# start a run
r = requests.post(f"{MESH}/api/executions", headers=H, json={
    "kind": "agent",
    "agentId": "<agent id>",
    "input": {"prompt": "Weekly spend digest"},
})
execution_id = r.json()["executionId"]

# follow the trace
d = requests.get(f"{MESH}/api/executions/{execution_id}", headers=H).json()
for span in d["spans"]:
    print(span["seq"], span["kind"], span["status"], span["durationMs"], "ms")`

const CLI_SNIPPET = `$ azimara agents list
$ azimara agents register --manifest agent.yaml
$ azimara executions start --agent customer-triage --input prompt="triage ACC-4821"
$ azimara executions trace exec_01h... --watch
$ azimara policies simulate --action tool_invoke --risk high
$ azimara usage summary --month current`

function Code({ code, lang }: { code: string; lang: string }) {
  return (
    <pre className="font-mono text-caption bg-[#0D1424] border border-border rounded-lg p-3 overflow-x-auto text-[#B4C0D4] whitespace-pre" data-testid={`code-${lang}`}>
      {code}
    </pre>
  )
}

export function DevPortalView() {
  const { data, error, loading } = useApi<{ apiKeys: { id: string; name: string; prefix: string; status: string }[] }>('/api/identity')
  const [tab, setTab] = useState<'typescript' | 'python' | 'cli' | 'rest'>('rest')

  return (
    <div className="space-y-5" data-testid="devportal-view">
      <PageHeader title="Developer Portal" subtitle="REST API, SDKs, CLI and MCP integration paths. Every endpoint enforces the same identity, policy, metering and audit machinery as the console." />
      {error && <ErrorNote message={error} />}

      <div className="flex items-center gap-1.5 flex-wrap">
        {(['rest', 'typescript', 'python', 'cli'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-lg border px-3 py-1.5 text-caption motion-fast ${tab === t ? 'border-[#8B7CFF] text-foreground bg-[#8B7CFF]/10' : 'border-border text-muted-foreground'}`}>
            {t === 'rest' ? 'REST API' : t === 'typescript' ? 'TypeScript SDK' : t === 'python' ? 'Python SDK' : 'CLI'}
          </button>
        ))}
      </div>

      {tab === 'rest' && (
        <Section title="API surface" description="All requests require an authenticated session or scoped API key plus the x-workspace-id header">
          <div className="space-y-2">
            {ENDPOINTS.map(([method, path, desc]) => (
              <div key={path + method} className="flex gap-3 rounded-lg border border-border bg-panel px-3 py-2.5">
                <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-micro font-bold ${method === 'GET' ? 'bg-[#5D8CFF]/15 text-[#5D8CFF]' : 'bg-[#8B7CFF]/15 text-[#8B7CFF]'}`}>{method}</span>
                <div className="min-w-0">
                  <p className="font-mono text-caption text-foreground">{path}</p>
                  <p className="text-micro text-muted-foreground mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {tab === 'typescript' && (
        <Section title="TypeScript SDK">
          <Code lang="ts" code={TS_SNIPPET} />
        </Section>
      )}
      {tab === 'python' && (
        <Section title="Python SDK">
          <Code lang="py" code={PY_SNIPPET} />
        </Section>
      )}
      {tab === 'cli' && (
        <Section title="CLI">
          <Code lang="sh" code={CLI_SNIPPET} />
        </Section>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Section title="Workspace API keys" description="Create keys in Identity & Access — hashed at rest, shown once">
          {loading && !data ? <LoadingBlock rows={2} /> : (
            <div className="space-y-2">
              {(data?.apiKeys ?? []).map((k) => (
                <div key={k.id} className="flex items-center justify-between rounded-lg border border-border bg-panel px-3 py-2">
                  <div><p className="text-caption font-medium">{k.name}</p><p className="text-micro font-mono text-muted-foreground">{k.prefix}…</p></div>
                  <StatusChip status={k.status === 'active' ? 'succeeded' : 'paused'} size="xs" />
                </div>
              ))}
            </div>
          )}
        </Section>
        <Section title="Webhooks & events">
          <p className="text-caption text-muted-foreground">Execution lifecycle events (started, approval_required, completed, failed), policy decisions and budget alerts can be delivered to registered webhooks. MCP-compatible integration paths let external agent frameworks register tools and agents without rewrites. Starter templates and example repositories ship with the Builder tier.</p>
        </Section>
      </div>
    </div>
  )
}
