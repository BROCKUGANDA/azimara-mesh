'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useState } from 'react'
import { api, useApi, fmtUsd, fmtMs, fmtDate, timeAgo, fmtNum } from '@/lib/client'
import { PageHeader, Section, DataTable, StatusChip, ErrorNote, LoadingBlock, SeededNote } from '@/components/mesh/kit'
import { useAppStore } from '@/lib/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Play } from 'lucide-react'

interface ExecRow extends Record<string, unknown> {
  id: string; kind: string; agent: string | null; workflow: string | null; status: string; trigger: string;
  startedAt: string; durationMs: number; costUsd: number; tokenIn: number; tokenOut: number;
  toolCallCount: number; error: string | null; isReplay: boolean; delegationDepth: number;
  agentVersion: string | null; workflowVersion: number | null;
}

export function ExecutionsView() {
  const navigate = useAppStore((s) => s.navigate)
  const params = useAppStore((s) => s.params)
  const refreshKey = useAppStore((s) => s.refreshKey)
  const [statusFilter, setStatusFilter] = useState(params.status ?? 'all')
  const [kindFilter, setKindFilter] = useState('all')
  const [runOpen, setRunOpen] = useState(false)
  const path = `/api/executions?take=60${statusFilter !== 'all' ? `&status=${statusFilter}` : ''}${kindFilter !== 'all' ? `&kind=${kindFilter}` : ''}`
  const { data, error, loading } = useApi<{ executions: ExecRow[] }>(path, { pollMs: 4000, refreshKey })

  const rows = (data?.executions ?? []).map((e) => ({
    ...e,
    target: e.agent ?? e.workflow ?? '—',
  }))

  const active = (data?.executions ?? []).filter((e) => ['running', 'queued'].includes(e.status)).length
  const waiting = (data?.executions ?? []).filter((e) => e.status === 'waiting_approval').length

  return (
    <div className="space-y-5" data-testid="executions-view">
      <PageHeader
        title="Execution Center"
        subtitle="Every agent and workflow run — correlated, traced, policy-checked and metered. Redacted by default."
        actions={<Button className="radius-button" onClick={() => setRunOpen(true)}><Play className="h-4 w-4 mr-1" />New run</Button>}
        badge={
          <>
            {active > 0 && <StatusChip status="running" size="xs" />}
            {waiting > 0 && <span className="inline-flex items-center gap-1 rounded-full border border-[#F2B95D]/35 bg-[#F2B95D]/15 px-2 py-0.5 text-micro text-[#F2B95D]">{waiting} awaiting approval</span>}
          </>
        }
      />
      {error && <ErrorNote message={error} />}
      <SeededNote />

      <Section>
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-48 radius-control bg-panel text-caption"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {['running', 'queued', 'waiting_approval', 'succeeded', 'failed', 'cancelled', 'timed_out'].map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger className="h-9 w-44 radius-control bg-panel text-caption"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All kinds</SelectItem>
              <SelectItem value="agent_run">agent runs</SelectItem>
              <SelectItem value="workflow_run">workflow runs</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-caption text-muted-foreground ml-auto">polling live · {rows.length} shown</span>
        </div>

        {loading && !data ? <LoadingBlock /> : (
          <DataTable
            rows={rows}
            onRowClick={(e) => navigate('executions', { executionId: e.id })}
            columns={[
              { key: 'id', label: 'Execution', render: (e) => (
                <div>
                  <p className="font-mono text-caption">…{String(e.id).slice(-8)}{e.isReplay ? <span className="ml-1.5 text-[#8B7CFF]">replay</span> : null}{e.delegationDepth > 0 ? <span className="ml-1.5 text-[#5D8CFF]">depth {e.delegationDepth}</span> : null}</p>
                  <p className="text-micro text-muted-foreground">{e.kind === 'agent_run' ? `agent v${e.agentVersion}` : `workflow v${e.workflowVersion}`}</p>
                </div>
              ) },
              { key: 'target', label: 'Target' },
              { key: 'status', label: 'Status', render: (e) => <StatusChip status={e.status} size="xs" /> },
              { key: 'trigger', label: 'Trigger', render: (e) => <span className="text-caption">{e.trigger}</span> },
              { key: 'durationMs', label: 'Duration', align: 'right', render: (e) => fmtMs(e.durationMs) },
              { key: 'costUsd', label: 'Cost', align: 'right', render: (e) => fmtUsd(e.costUsd) },
              { key: 'toolCallCount', label: 'Tools', align: 'right' },
              { key: 'error', label: 'Error', className: 'max-w-[220px] truncate', render: (e) => e.error ? <span className="text-caption text-[#F06B7A]">{String(e.error).slice(0, 60)}</span> : '—' },
              { key: 'startedAt', label: 'Started', render: (e) => timeAgo(e.startedAt) },
            ]}
          />
        )}
      </Section>

      <NewRunDialog open={runOpen} onOpenChange={setRunOpen} onStarted={(id) => navigate('executions', { executionId: id })} />
    </div>
  )
}

function NewRunDialog({ open, onOpenChange, onStarted }: { open: boolean; onOpenChange: (v: boolean) => void; onStarted: (id: string) => void }) {
  const { data: agentData } = useApi<{ agents: { id: string; name: string; status: string }[] }>(open ? '/api/agents' : null)
  const { data: wfData } = useApi<{ workflows: { id: string; name: string; status: string }[] }>(open ? '/api/workflows' : null)
  const [kind, setKind] = useState<'agent' | 'workflow'>('agent')
  const [agentId, setAgentId] = useState('')
  const [workflowId, setWorkflowId] = useState('')
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  const start = async () => {
    setRunning(true)
    setError(null)
    try {
      const body = kind === 'agent'
        ? { kind: 'agent', agentId, input: { prompt: prompt || 'Run the standard task for this agent.' } }
        : { kind: 'workflow', workflowId, input: { prompt: prompt || 'Workflow run.' } }
      const res = await api<{ executionId: string }>('/api/executions', { method: 'POST', body })
      onOpenChange(false)
      onStarted(res.executionId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Run rejected')
    } finally {
      setRunning(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="radius-modal">
        <DialogHeader><DialogTitle>Start a governed run</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Select value={kind} onValueChange={(v) => setKind(v as 'agent' | 'workflow')}>
            <SelectTrigger className="radius-control bg-panel text-caption"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="agent">Agent run</SelectItem>
              <SelectItem value="workflow">Workflow run</SelectItem>
            </SelectContent>
          </Select>
          {kind === 'agent' ? (
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger className="radius-control bg-panel text-caption"><SelectValue placeholder="Select agent" /></SelectTrigger>
              <SelectContent>
                {(agentData?.agents ?? []).filter((a) => !['draft', 'paused', 'archived'].includes(a.status)).map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select value={workflowId} onValueChange={setWorkflowId}>
              <SelectTrigger className="radius-control bg-panel text-caption"><SelectValue placeholder="Select workflow" /></SelectTrigger>
              <SelectContent>
                {(wfData?.workflows ?? []).filter((w) => w.status === 'published').map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Input placeholder="Task prompt / input" value={prompt} onChange={(e) => setPrompt(e.target.value)} className="radius-control bg-panel" />
          {error && <ErrorNote message={error} />}
          <p className="text-micro text-muted-foreground">The run passes budget checks, identity scoping and policy gates before any model call. Approval-gated tools pause the execution for a human.</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" className="radius-button" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="radius-button" disabled={running || (kind === 'agent' ? !agentId : !workflowId)} onClick={start}>{running ? 'Starting…' : 'Execute'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
