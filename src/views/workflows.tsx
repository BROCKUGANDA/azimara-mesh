'use client'

// Workflows — list, canvas editor, code-first spec, validation, live runs.

import { useEffect, useState } from 'react'
import { api, useApi, fmtUsd, fmtMs, timeAgo } from '@/lib/client'
import { PageHeader, Section, DataTable, StatusChip, ErrorNote, LoadingBlock, EmptyState, Json } from '@/components/mesh/kit'
import { WorkflowCanvas } from '@/components/mesh/canvas'
import { useAppStore } from '@/lib/client'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Plus, Rocket, Save, Archive } from 'lucide-react'
import type { WorkflowSpec } from '@/lib/types'

interface WfRow extends Record<string, unknown> {
  id: string; name: string; description: string; version: number; status: string; triggerType: string;
  nodes: number; nodeTypes: string[]; totalRuns: number; succeeded: number; failed: number; updatedAt: string;
}

export function WorkflowsView() {
  const navigate = useAppStore((s) => s.navigate)
  const refreshKey = useAppStore((s) => s.refreshKey)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { data, error, loading, reload } = useApi<{ workflows: WfRow[] }>('/api/workflows', { refreshKey })

  if (selectedId) {
    return <WorkflowEditor workflowId={selectedId} onBack={() => { setSelectedId(null); reload() }} />
  }

  return (
    <div className="space-y-5" data-testid="workflows-view">
      <PageHeader
        title="Workflows"
        subtitle="Durable multi-agent orchestration: sequential, parallel, conditional, approval checkpoints, bounded loops — with compensation and replay."
        actions={<Button className="radius-button" onClick={async () => {
          try {
            const res = await api<{ workflow: { id: string } }>('/api/workflows', { method: 'POST', body: { name: `New workflow ${Date.now() % 10000}` } })
            setSelectedId(res.workflow.id)
          } catch (err) { toast.error(err instanceof Error ? err.message : 'Create failed') }
        }}><Plus className="h-4 w-4 mr-1" />New workflow</Button>}
      />
      {error && <ErrorNote message={error} />}
      {loading && !data ? <LoadingBlock /> : (data?.workflows ?? []).length === 0 ? (
        <Section><EmptyState title="No workflows yet" hint="Create your first multi-agent workflow." /></Section>
      ) : (
        <DataTable
          rows={data?.workflows ?? []}
          onRowClick={(w) => setSelectedId(w.id)}
          columns={[
            { key: 'name', label: 'Workflow', render: (w) => (
              <div>
                <p className="font-medium">{w.name}</p>
                <p className="text-micro text-muted-foreground truncate max-w-[320px]">{w.description}</p>
              </div>
            ) },
            { key: 'status', label: 'Status', render: (w) => <StatusChip status={w.status} size="xs" /> },
            { key: 'version', label: 'Version', render: (w) => <span className="font-mono text-caption">v{w.version}</span> },
            { key: 'nodes', label: 'Topology', render: (w) => <span className="text-caption">{w.nodes} nodes · {[...new Set(w.nodeTypes)].slice(0, 4).join(', ')}</span> },
            { key: 'triggerType', label: 'Trigger', render: (w) => <span className="text-caption">{w.triggerType}</span> },
            { key: 'totalRuns', label: 'Runs', align: 'right' },
            { key: 'succeeded', label: 'OK', align: 'right' },
            { key: 'failed', label: 'Failed', align: 'right' },
            { key: 'updatedAt', label: 'Updated', render: (w) => timeAgo(w.updatedAt) },
          ]}
        />
      )}
    </div>
  )
}

function WorkflowEditor({ workflowId, onBack }: { workflowId: string; onBack: () => void }) {
  const { data, error, loading, reload } = useApi<{
    workflow: { id: string; name: string; description: string; version: number; status: string; spec: WorkflowSpec; validation: { ok: boolean; errors: string[] } }
    runs: Record<string, unknown>[]
  }>(`/api/workflows/${workflowId}`, { pollMs: 5000 })
  const { data: agentData } = useApi<{ agents: { id: string; name: string }[] }>('/api/agents')
  const { data: toolData } = useApi<{ tools: { id: string; name: string }[] }>('/api/tools')
  const [spec, setSpec] = useState<WorkflowSpec | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (data?.workflow?.spec && !dirty && !spec) setSpec(data.workflow.spec)
  }, [data, dirty, spec])

  const save = async (publish = false) => {
    if (!spec) return
    setSaving(true)
    try {
      if (publish) {
        await api(`/api/workflows/${workflowId}`, { method: 'PATCH', body: { spec } })
        const res = await api<{ workflow?: { version?: number } }>(`/api/workflows/${workflowId}`, { method: 'POST', body: { action: 'publish' } })
        toast.success(`Published v${res.workflow?.version ?? ''}`)
      } else {
        await api(`/api/workflows/${workflowId}`, { method: 'PATCH', body: { spec } })
        toast.success('Spec saved (draft)')
      }
      setDirty(false)
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const run = async () => {
    try {
      const res = await api<{ executionId: string }>(`/api/workflows/${workflowId}`, { method: 'POST', body: { action: 'run', input: { prompt: 'Workflow test run' } } })
      toast.success('Workflow execution started')
      window.location.hash = ''
      const { useAppStore } = await import('@/lib/client')
      useAppStore.getState().navigate('executions', { executionId: res.executionId })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Run rejected')
    }
  }

  const w = data?.workflow

  return (
    <div className="space-y-4" data-testid="workflow-editor">
      <button onClick={onBack} className="flex items-center gap-1 text-caption text-muted-foreground hover:text-foreground motion-fast">← Workflows</button>
      {loading && !w ? <LoadingBlock rows={5} /> : error ? <ErrorNote message={error} /> : w && spec && (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-h3 flex items-center gap-2">{w.name} <StatusChip status={w.status} size="xs" /> <span className="font-mono text-caption text-muted-foreground">v{w.version}</span></h1>
              <p className="text-caption text-muted-foreground">{w.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="radius-button" onClick={() => save(false)} disabled={saving || !dirty || !data.workflow.validation.ok}><Save className="h-3.5 w-3.5 mr-1" />Save draft</Button>
              <Button size="sm" variant="outline" className="radius-button" onClick={() => save(true)} disabled={saving || !data.workflow.validation.ok}><Rocket className="h-3.5 w-3.5 mr-1" />Publish</Button>
              <Button size="sm" className="radius-button" onClick={run} disabled={w.status !== 'published'}>Test run</Button>
            </div>
          </div>

          <WorkflowCanvas
            spec={spec}
            agents={agentData?.agents ?? []}
            tools={toolData?.tools ?? []}
            validation={data.workflow.validation}
            onChange={(s) => { setSpec(s); setDirty(true) }}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section title="Recent runs">
              <DataTable
                rows={data.runs}
                columns={[
                  { key: 'id', label: 'Run', render: (r) => <span className="font-mono text-caption">…{String(r.id).slice(-8)}</span> },
                  { key: 'status', label: 'Status', render: (r) => <StatusChip status={r.status} size="xs" /> },
                  { key: 'durationMs', label: 'Duration', align: 'right', render: (r) => fmtMs(r.durationMs) },
                  { key: 'costUsd', label: 'Cost', align: 'right', render: (r) => fmtUsd(r.costUsd) },
                  { key: 'startedAt', label: 'Started', render: (r) => timeAgo(r.startedAt) },
                ]}
              />
            </Section>
            <Section title="Spec budgets" description="Bounded resources enforced by the engine">
              <Json data={spec.budgets} />
            </Section>
          </div>
        </>
      )}
    </div>
  )
}
