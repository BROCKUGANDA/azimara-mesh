'use client'

// Execution detail — trace waterfall, chronological timeline, tool calls with
// redacted payloads, policy decision evidence, agent-to-agent handoffs.

import { useState } from 'react'
import { api, useApi, fmtUsd, fmtMs, fmtDate, timeAgo } from '@/lib/client'
import { PageHeader, Section, StatusChip, ErrorNote, LoadingBlock, KV, Json, DataTable, RiskBadge } from '@/components/mesh/kit'
import { TraceWaterfall } from '@/components/mesh/charts'
import { useAppStore } from '@/lib/client'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { ChevronLeft, Ban, RotateCcw, CheckCircle2, XCircle } from 'lucide-react'
import type { TraceSpan } from '@/lib/types'

interface ExecDetail {
  execution: {
    id: string; kind: string; status: string; trigger: string; correlationId: string;
    agent: { id: string; name: string; autonomyLevel: string } | null;
    workflow: { id: string; name: string } | null;
    agentVersion: string | null; workflowVersion: number | null;
    parentExecutionId: string | null; parentStatus: string | null;
    delegationDepth: number; isReplay: boolean; identitySubject: string;
    input: Record<string, unknown>; output: Record<string, unknown> | null; error: string | null;
    startedAt: string; finishedAt: string | null; durationMs: number; costUsd: number;
    tokenIn: number; tokenOut: number; toolCallCount: number; retryCount: number;
    budgetCaps: Record<string, number>; checkpoint: Record<string, unknown>;
    children: { id: string; status: string; agentId: string | null; delegationDepth: number }[];
  }
  spans: TraceSpan[]
  toolCalls: { id: string; toolName: string; status: string; latencyMs: number; error: string | null; input: Record<string, unknown>; output: Record<string, unknown> | null; createdAt: string }[]
  messages: { id: string; senderId: string; recipientId: string; type: string; schemaVersion: string; status: string; payload: Record<string, unknown>; createdAt: string }[]
  decisions: { id: string; policyName: string; action: string; resource: string; decision: string; reason: string; context: Record<string, unknown>; createdAt: string }[]
}

export function ExecutionDetailView({ executionId }: { executionId: string }) {
  const navigate = useAppStore((s) => s.navigate)
  const bumpRefresh = useAppStore((s) => s.bumpRefresh)
  const { data, error, loading, reload } = useApi<ExecDetail>(`/api/executions/${executionId}`, { pollMs: 2500 })
  const [span, setSpan] = useState<TraceSpan | null>(null)
  const d = data

  const act = async (action: string) => {
    try {
      const res = await api<{ executionId?: string }>(`/api/executions/${executionId}`, { method: 'POST', body: { action } })
      toast.success(action === 'cancel' ? 'Execution cancelled' : `Replay started — external mutations suppressed`)
      if (action === 'replay' && res.executionId) navigate('executions', { executionId: res.executionId })
      else { reload(); bumpRefresh() }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed')
    }
  }

  const approve = async (approve: boolean) => {
    try {
      const approvals = await api<{ approvals: { id: string; executionId: string | null }[] }>('/api/approvals?status=pending')
      const target = approvals.approvals.find((a) => a.executionId === executionId)
      if (!target) { toast.error('No pending approval found for this execution'); return }
      await api(`/api/approvals/${target.id}`, { method: 'POST', body: { decision: approve ? 'approve' : 'reject' } })
      toast.success(approve ? 'Approved — execution resuming' : 'Rejected — execution halted')
      reload()
      bumpRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Decision failed')
    }
  }

  const e = d?.execution
  const isWaiting = e?.status === 'waiting_approval'
  const isActive = e ? ['running', 'queued', 'waiting_approval'].includes(e.status) : false

  return (
    <div className="space-y-4" data-testid="execution-detail">
      <button onClick={() => navigate('executions')} className="flex items-center gap-1 text-caption text-muted-foreground hover:text-foreground motion-fast">
        <ChevronLeft className="h-4 w-4" /> Execution Center
      </button>

      {loading && !e ? <LoadingBlock rows={6} /> : error ? <ErrorNote message={error} /> : e && (
        <>
          <PageHeader
            title={`Execution …${e.id.slice(-8)}`}
            subtitle={`${e.kind === 'agent_run' ? `Agent: ${e.agent?.name ?? '—'} v${e.agentVersion}` : `Workflow: ${e.workflow?.name ?? '—'} v${e.workflowVersion}`} · trigger ${e.trigger}${e.isReplay ? ' · replay (safe)' : ''}${e.delegationDepth > 0 ? ` · delegation depth ${e.delegationDepth}` : ''}`}
            badge={<StatusChip status={e.status} />}
            actions={
              <>
                {isWaiting && (
                  <>
                    <Button size="sm" className="radius-button" onClick={() => approve(true)}><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Approve</Button>
                    <Button size="sm" variant="outline" className="radius-button text-[#F06B7A] hover:text-[#F06B7A]" onClick={() => approve(false)}><XCircle className="h-3.5 w-3.5 mr-1" />Reject</Button>
                  </>
                )}
                {isActive && !isWaiting && (
                  <Button size="sm" variant="outline" className="radius-button text-[#F06B7A] hover:text-[#F06B7A]" onClick={() => act('cancel')}><Ban className="h-3.5 w-3.5 mr-1" />Cancel</Button>
                )}
                {!isActive && e.kind === 'agent_run' && (
                  <Button size="sm" variant="outline" className="radius-button" onClick={() => act('replay')}><RotateCcw className="h-3.5 w-3.5 mr-1" />Safe replay</Button>
                )}
              </>
            }
          />

          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {[
              { l: 'Duration', v: fmtMs(e.durationMs) },
              { l: 'Cost', v: fmtUsd(e.costUsd) },
              { l: 'Tokens', v: `${(e.tokenIn / 1000).toFixed(1)}k in / ${(e.tokenOut / 1000).toFixed(1)}k out` },
              { l: 'Tool calls', v: String(e.toolCallCount) },
              { l: 'Retries', v: String(e.retryCount) },
              { l: 'Correlation', v: <span className="font-mono text-caption">{e.correlationId.slice(0, 14)}</span> },
            ].map((m) => (
              <div key={m.l} className="rounded-xl border border-border bg-card p-3">
                <p className="text-micro text-muted-foreground">{m.l}</p>
                <p className="text-body-sm font-semibold tnum mt-0.5">{m.v}</p>
              </div>
            ))}
          </div>

          {e.error && (
            <ErrorNote message={e.error} />
          )}
          {isWaiting && (
            <div className="rounded-lg border border-[#F2B95D]/30 bg-[#F2B95D]/10 px-3 py-2 text-caption text-[#F2B95D]">
              Waiting for human approval — the planned tool call is checkpointed and will resume after a decision.
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
            <div className="space-y-4">
              <Section title="Trace waterfall" description="Model requests, tool calls, policy checks, memory retrieval and approvals">
                <TraceWaterfall spans={d.spans} onSelect={setSpan} />
              </Section>

              {span && (
                <Section title={`Span · ${span.label}`}>
                  <KV k="Kind" v={span.kind} />
                  <KV k="Status" v={<StatusChip status={span.status === 'succeeded' ? 'succeeded' : span.status === 'failed' ? 'failed' : span.status === 'denied' ? 'denied' : span.status} size="xs" />} />
                  <KV k="Started" v={fmtDate(span.startedAt)} />
                  <KV k="Duration" v={fmtMs(span.durationMs)} />
                  <div className="mt-2"><Json data={span.detail} /></div>
                </Section>
              )}

              <Section title="Tool calls" description="Payloads redacted for display; full evidence retained in the audit store">
                <DataTable
                  rows={d.toolCalls as unknown as Record<string, unknown>[]}
                  columns={[
                    { key: 'toolName', label: 'Tool' },
                    { key: 'status', label: 'Status', render: (c) => <StatusChip status={c.status === 'succeeded' ? 'succeeded' : c.status === 'failed' ? 'failed' : c.status === 'timeout' ? 'timed_out' : c.status} size="xs" /> },
                    { key: 'latencyMs', label: 'Latency', align: 'right', render: (c) => fmtMs(c.latencyMs) },
                    { key: 'input', label: 'Input (redacted)', className: 'max-w-[220px] truncate', render: (c) => <span className="font-mono text-micro text-muted-foreground">{JSON.stringify(c.input).slice(0, 60)}</span> },
                    { key: 'error', label: 'Error', render: (c) => c.error ? <span className="text-caption text-[#F06B7A]">{String(c.error).slice(0, 50)}</span> : '—' },
                  ]}
                />
              </Section>

              <Section title="Policy decisions" description="Exactly why each decision was made — evidence, not vibes">
                <div className="space-y-2">
                  {d.decisions.map((dec) => (
                    <div key={dec.id} className="rounded-lg border border-border bg-panel p-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusChip status={dec.decision === 'allow' ? 'succeeded' : dec.decision === 'deny' ? 'denied' : 'pending'} size="xs" />
                        <span className="text-caption font-medium">{dec.policyName}</span>
                        <span className="text-micro text-muted-foreground">{dec.action} · {timeAgo(dec.createdAt)}</span>
                      </div>
                      <p className="text-caption text-muted-foreground mt-1.5">{dec.reason}</p>
                    </div>
                  ))}
                  {d.decisions.length === 0 && <p className="text-caption text-muted-foreground">No recorded decisions.</p>}
                </div>
              </Section>
            </div>

            <div className="space-y-4">
              <Section title="Execution identity">
                <KV k="Identity subject" v={<span className="font-mono text-caption">{e.identitySubject || 'seed'}</span>} mono />
                <KV k="Autonomy" v={e.agent?.autonomyLevel ?? '—'} />
                <KV k="Parent" v={e.parentExecutionId ? <button className="text-[#5D8CFF] font-mono text-caption underline" onClick={() => navigate('executions', { executionId: e.parentExecutionId as string })}>…{e.parentExecutionId.slice(-8)} ({e.parentStatus})</button> : '—'} />
                <KV k="Budget caps" v={`${e.budgetCaps.maxSteps ?? '—'} steps · ${fmtMs(e.budgetCaps.timeoutMs)} · ${fmtUsd(e.budgetCaps.maxCostUsd)}`} />
                {e.children.length > 0 && (
                  <KV k="Delegated to" v={
                    <div className="space-y-1">
                      {e.children.map((c) => (
                        <button key={c.id} className="block text-[#5D8CFF] font-mono text-caption underline text-right" onClick={() => navigate('executions', { executionId: c.id })}>
                          …{c.id.slice(-8)} <StatusChip status={c.status} size="xs" />
                        </button>
                      ))}
                    </div>
                  } />
                )}
              </Section>

              <Section title="Input">
                <Json data={e.input} />
              </Section>

              <Section title="Output" description={e.isReplay ? 'Replay: external side effects suppressed' : undefined}>
                {e.output ? <Json data={e.output} /> : <p className="text-caption text-muted-foreground">{isActive ? 'Pending — output appears when the run completes.' : 'No output recorded.'}</p>}
              </Section>

              {d.messages.length > 0 && (
                <Section title="Agent-to-agent messages">
                  {d.messages.map((m) => (
                    <KV key={m.id} k={`${m.senderId} → ${m.recipientId}`} v={`${m.type} · v${m.schemaVersion} · ${m.status}`} mono />
                  ))}
                </Section>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
