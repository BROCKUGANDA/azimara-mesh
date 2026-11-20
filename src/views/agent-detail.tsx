'use client'

// Agent detail — 11 tabs per directive §35: Overview, Configuration, Versions,
// Deployments, Executions, Tools, Memory, Evaluations, Policies, Costs, Audit.

import { useEffect, useState } from 'react'
import { api, useApi, fmtUsd, fmtMs, fmtDate, timeAgo, fmtNum } from '@/lib/client'
import { PageHeader, Section, DataTable, StatusChip, AutonomyBadge, RiskBadge, ErrorNote, LoadingBlock, KV, Json, EmptyState } from '@/components/mesh/kit'
import { ExecutionTimeline, TrendLine } from '@/components/mesh/charts'
import { useAppStore } from '@/lib/client'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { ArrowLeft, ChevronLeft, Play, Pause, Rocket, RotateCcw, ShieldOff, Save } from 'lucide-react'

interface AgentBase extends Record<string, unknown> {
  id: string; name: string; slug: string; description: string; status: string; healthStatus: string;
  autonomyLevel: string; category: string; framework: string; runtimeType: string; currentVersion: string;
  ownerName: string; successRate: number; avgLatencyMs: number; spendMonth: number; lastActiveAt: string | null;
  createdAt: string; systemPrompt: string;
  modelConfig: { primary?: string; fallback?: string[]; temperature?: number; maxTokens?: number };
  toolPermissions: string[]; memoryConfig: { namespaces?: string[]; contextTokens?: number };
  resourceLimits: Record<string, number>; evalProfile: Record<string, unknown>;
}

const TABS = ['overview', 'configuration', 'versions', 'deployments', 'executions', 'tools', 'memory', 'evaluations', 'policies', 'costs', 'audit'] as const

export function AgentDetailView({ agentId }: { agentId: string }) {
  const navigate = useAppStore((s) => s.navigate)
  const bumpRefresh = useAppStore((s) => s.bumpRefresh)
  const [tab, setTab] = useState<(typeof TABS)[number]>('overview')
  const { data, error, loading, reload } = useApi<{ agent: AgentBase; tabData: Record<string, unknown> }>(`/api/agents/${agentId}?tab=${tab}`, { deps: [tab] })

  const act = async (action: string) => {
    try {
      await api(`/api/agents/${agentId}`, { method: 'POST', body: { action } })
      toast.success(`Agent ${action} applied`)
      reload()
      bumpRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed')
    }
  }

  const a = data?.agent
  const td = data?.tabData ?? {}

  return (
    <div className="space-y-4" data-testid="agent-detail">
      <button onClick={() => navigate('fleet')} className="flex items-center gap-1 text-caption text-muted-foreground hover:text-foreground motion-fast">
        <ChevronLeft className="h-4 w-4" /> Agent Fleet
      </button>

      {loading && !a ? <LoadingBlock rows={6} /> : error ? <ErrorNote message={error} /> : a && (
        <>
          <PageHeader
            title={a.name}
            subtitle={a.description}
            badge={<><StatusChip status={a.status} /><StatusChip status={a.healthStatus} size="xs" /></>}
            actions={
              <>
                <Button variant="outline" size="sm" className="radius-button" onClick={() => navigate('executions')}>
                  <Play className="h-3.5 w-3.5 mr-1" /> Executions
                </Button>
                {['healthy', 'degraded', 'ready'].includes(a.status) && (
                  <Button variant="outline" size="sm" className="radius-button" onClick={() => act('pause')}><Pause className="h-3.5 w-3.5 mr-1" />Pause</Button>
                )}
                {a.status === 'paused' && (
                  <Button variant="outline" size="sm" className="radius-button" onClick={() => act('resume')}><Play className="h-3.5 w-3.5 mr-1" />Resume</Button>
                )}
                <Button size="sm" className="radius-button" onClick={() => startRun(agentId, a)}><Rocket className="h-3.5 w-3.5 mr-1" />Run now</Button>
              </>
            }
          />

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { l: 'Success rate', v: `${Math.round(a.successRate * 100)}%` },
              { l: 'Avg latency', v: fmtMs(a.avgLatencyMs) },
              { l: 'Version', v: `v${a.currentVersion}` },
              { l: 'Spend (month)', v: fmtUsd(a.spendMonth) },
              { l: 'Owner', v: a.ownerName || '—' },
            ].map((m) => (
              <div key={m.l} className="rounded-xl border border-border bg-card p-3">
                <p className="text-micro text-muted-foreground">{m.l}</p>
                <p className="text-body-sm font-semibold tnum mt-0.5">{m.v}</p>
              </div>
            ))}
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as (typeof TABS)[number])}>
            <TabsList className="bg-panel flex-wrap h-auto">
              {TABS.map((t) => <TabsTrigger key={t} value={t} className="text-caption capitalize">{t}</TabsTrigger>)}
            </TabsList>

            <TabsContent value="overview" className="mt-3 space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Section title="Identity & runtime">
                  <KV k="Agent ID" v={<span className="font-mono text-caption">{a.id}</span>} mono />
                  <KV k="Slug" v={a.slug} mono />
                  <KV k="Category" v={a.category} />
                  <KV k="Framework" v={a.framework} />
                  <KV k="Runtime" v={a.runtimeType} />
                  <KV k="Autonomy" v={<AutonomyBadge level={a.autonomyLevel} />} />
                  <KV k="Created" v={fmtDate(a.createdAt)} />
                  <KV k="Last active" v={timeAgo(a.lastActiveAt)} />
                </Section>
                <Section title="Recent executions" description="status timeline — last 24 runs">
                  {(td.recentTimeline as { status: string; startedAt: string; durationMs: number; costUsd: number }[] | undefined) ? (
                    <>
                      <ExecutionTimeline items={td.recentTimeline as { status: string; startedAt: string; durationMs: number; costUsd: number }[]} />
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        {(() => {
                          const m = td.metrics as { totalExecutions: number; failedExecutions: number; running: number } | undefined
                          return [
                            { l: 'Total runs', v: fmtNum(m?.totalExecutions) },
                            { l: 'Failed', v: fmtNum(m?.failedExecutions) },
                            { l: 'Active now', v: fmtNum(m?.running) },
                          ].map((x) => (
                            <div key={x.l} className="rounded-lg border border-border bg-panel py-2">
                              <p className="text-micro text-muted-foreground">{x.l}</p>
                              <p className="text-body-sm font-semibold tnum">{x.v}</p>
                            </div>
                          ))
                        })()}
                      </div>
                    </>
                  ) : <LoadingBlock rows={2} />}
                </Section>
              </div>
            </TabsContent>

            <TabsContent value="configuration" className="mt-3">
              <ConfigTab agent={a} tabData={td} onSaved={() => { reload(); toast.success('Configuration saved') }} />
            </TabsContent>

            <TabsContent value="versions" className="mt-3">
              <Section title="Immutable versions" description="Publishing creates a pinned snapshot; running executions keep the version they started with." actions={
                <Button size="sm" variant="outline" className="radius-button" onClick={() => act('rollback')}><RotateCcw className="h-3.5 w-3.5 mr-1" />Roll back</Button>
              }>
                <DataTable
                  rows={(td.versions as Record<string, unknown>[] | undefined) ?? []}
                  columns={[
                    { key: 'version', label: 'Version', render: (v) => <span className="font-mono">v{v.version}</span> },
                    { key: 'status', label: 'Status', render: (v) => <StatusChip status={v.status} size="xs" /> },
                    { key: 'changelog', label: 'Changelog' },
                    { key: 'evalScore', label: 'Eval', align: 'right', render: (v) => v.evalScore != null ? `${Math.round((v.evalScore as number) * 100)}%` : '—' },
                    { key: 'publishedAt', label: 'Published', render: (v) => fmtDate(v.publishedAt) },
                    { key: 'diff', label: 'Diff', render: (v) => (v.diff as unknown[]).length ? <span className="text-caption text-[#8B7CFF]">{(v.diff as unknown[]).length} changes</span> : '—' },
                  ]}
                />
              </Section>
            </TabsContent>

            <TabsContent value="deployments" className="mt-3">
              <Section title="Deployments" actions={
                <Button size="sm" className="radius-button" onClick={() => deployAgent(agentId)}><Rocket className="h-3.5 w-3.5 mr-1" />Deploy current version</Button>
              }>
                <DataTable
                  rows={(td.deployments as Record<string, unknown>[] | undefined) ?? []}
                  onRowClick={(d) => navigate('deployments')}
                  columns={[
                    { key: 'environment', label: 'Environment', render: (d) => <span className="capitalize">{d.environment}</span> },
                    { key: 'strategy', label: 'Strategy', render: (d) => `${d.strategy}${d.strategy === 'canary' ? ` (${d.canaryPct}%)` : ''}` },
                    { key: 'status', label: 'Status', render: (d) => <StatusChip status={d.status} size="xs" /> },
                    { key: 'errorRate', label: 'Error rate', align: 'right', render: (d) => `${Math.round((d.errorRate as number) * 100)}%` },
                    { key: 'evalScore', label: 'Eval gate', align: 'right', render: (d) => `${Math.round((d.evalScore as number) * 100)}%` },
                    { key: 'createdAt', label: 'Created', render: (d) => fmtDate(d.createdAt) },
                  ]}
                />
              </Section>
            </TabsContent>

            <TabsContent value="executions" className="mt-3">
              <Section title="Executions" description="Runs owned by this agent, including delegations and replays.">
                <DataTable
                  rows={(td.executions as Record<string, unknown>[] | undefined) ?? []}
                  onRowClick={(e) => navigate('executions', { executionId: e.id })}
                  columns={[
                    { key: 'id', label: 'Execution', render: (e) => <span className="font-mono text-caption">…{String(e.id).slice(-8)}</span> },
                    { key: 'status', label: 'Status', render: (e) => <StatusChip status={e.status} size="xs" /> },
                    { key: 'trigger', label: 'Trigger', render: (e) => `${e.trigger}${e.isReplay ? ' (replay)' : ''}` },
                    { key: 'durationMs', label: 'Duration', align: 'right', render: (e) => fmtMs(e.durationMs) },
                    { key: 'costUsd', label: 'Cost', align: 'right', render: (e) => fmtUsd(e.costUsd) },
                    { key: 'startedAt', label: 'Started', render: (e) => timeAgo(e.startedAt) },
                  ]}
                />
              </Section>
            </TabsContent>

            <TabsContent value="tools" className="mt-3 space-y-4">
              <Section title="Granted tools">
                <div className="flex flex-wrap gap-2">
                  {((td.tools as Record<string, unknown>[] | undefined) ?? []).map((t) => (
                    <span key={String(t.id)} className="inline-flex items-center gap-2 rounded-lg border border-border bg-panel px-2.5 py-1.5">
                      <span className="text-caption font-medium">{String(t.name)}</span>
                      <RiskBadge level={String(t.riskClass)} />
                      <StatusChip status={String(t.status)} size="xs" />
                    </span>
                  ))}
                  {((td.tools as unknown[] | undefined) ?? []).length === 0 && <EmptyState title="No tools granted" hint="Attach tools in the Configuration tab." />}
                </div>
              </Section>
              <Section title="Recent tool calls">
                <DataTable
                  rows={(td.recentCalls as Record<string, unknown>[] | undefined) ?? []}
                  columns={[
                    { key: 'toolName', label: 'Tool' },
                    { key: 'status', label: 'Status', render: (c) => <StatusChip status={c.status} size="xs" /> },
                    { key: 'latencyMs', label: 'Latency', align: 'right', render: (c) => fmtMs(c.latencyMs) },
                    { key: 'error', label: 'Error', render: (c) => c.error ? <span className="text-[#F06B7A] text-caption">{String(c.error).slice(0, 60)}</span> : '—' },
                    { key: 'createdAt', label: 'When', render: (c) => timeAgo(c.createdAt) },
                  ]}
                />
              </Section>
            </TabsContent>

            <TabsContent value="memory" className="mt-3 space-y-4">
              {((td.namespaces as Record<string, unknown>[] | undefined) ?? []).map((n) => (
                <Section key={String(n.id)} title={String(n.name)} description={`${String(n.kind)} · ${String(n.classification)} · ${String(n.recordCount)} records · index ${String(n.indexStatus)}`}>
                  <div className="space-y-2">
                    {((n.recent as Record<string, unknown>[]) ?? []).map((r) => (
                      <div key={String(r.id)} className="rounded-lg border border-border bg-panel px-3 py-2">
                        <p className="text-caption">{String(r.content)}</p>
                        <p className="text-micro text-muted-foreground mt-1">{String(r.provenance)} · {fmtDate(String(r.createdAt))}</p>
                      </div>
                    ))}
                    {((n.recent as unknown[]) ?? []).length === 0 && <p className="text-caption text-muted-foreground">No recent records.</p>}
                  </div>
                </Section>
              ))}
              {((td.namespaces as unknown[] | undefined) ?? []).length === 0 && <Section><EmptyState title="No memory namespaces declared" hint="Attach namespaces in the Configuration tab." /></Section>}
            </TabsContent>

            <TabsContent value="evaluations" className="mt-3">
              <Section title="Evaluation history" description="Completed suites from the Evaluation Lab">
                <DataTable
                  rows={(td.history as Record<string, unknown>[] | undefined) ?? []}
                  columns={[
                    { key: 'label', label: 'Suite' },
                    { key: 'agentVersion', label: 'Version', render: (r) => <span className="font-mono text-caption">v{r.agentVersion}</span> },
                    { key: 'passRate', label: 'Pass rate', align: 'right', render: (r) => `${Math.round((r.passRate as number) * 100)}%` },
                    { key: 'avgScore', label: 'Score', align: 'right', render: (r) => (r.avgScore as number).toFixed(2) },
                    { key: 'avgLatencyMs', label: 'Latency', align: 'right', render: (r) => fmtMs(r.avgLatencyMs) },
                    { key: 'startedAt', label: 'When', render: (r) => fmtDate(r.startedAt) },
                  ]}
                />
              </Section>
            </TabsContent>

            <TabsContent value="policies" className="mt-3">
              <Section title="Policy decisions for this agent" description="Deterministic evaluations recorded on every consequential action.">
                <DataTable
                  rows={(td.decisions as Record<string, unknown>[] | undefined) ?? []}
                  columns={[
                    { key: 'decision', label: 'Decision', render: (d) => <StatusChip status={d.decision === 'allow' ? 'succeeded' : d.decision === 'deny' ? 'denied' : 'pending'} size="xs" /> },
                    { key: 'action', label: 'Action' },
                    { key: 'policyName', label: 'Policy' },
                    { key: 'reason', label: 'Reason', render: (d) => <span className="text-caption">{String(d.reason).slice(0, 90)}</span> },
                    { key: 'createdAt', label: 'When', render: (d) => timeAgo(d.createdAt) },
                  ]}
                />
              </Section>
            </TabsContent>

            <TabsContent value="costs" className="mt-3">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Section title="Spend this month">
                  <div className="flex items-end gap-6">
                    <div>
                      <p className="text-micro text-muted-foreground">Metered spend</p>
                      <p className="text-h2 tnum text-[#8B7CFF]">{fmtUsd((td as { monthSpend?: number }).monthSpend)}</p>
                    </div>
                    <div>
                      <p className="text-micro text-muted-foreground">Budget cap</p>
                      <p className="text-h3 tnum">{fmtUsd((td as { budget?: number }).budget)}</p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <TrendLine data={(td.daily as { day: string; cost: number }[] | undefined)?.map((d) => ({ day: d.day, cost: d.cost })) ?? []} keys={[{ key: 'cost', label: 'Cost (USD)', color: '#42D9E8' }]} height={160} formatter={(v) => `$${v}`} />
                  </div>
                </Section>
                <Section title="Budget guardrails">
                  <KV k="Monthly cap" v={fmtUsd((td as { budget?: number }).budget)} />
                  <KV k="Enforcement" v="Executions are blocked at the cap; policy decisions recorded" />
                  <KV k="Metering" v="tokens (in/out), executions, tool invocations, memory reads" />
                </Section>
              </div>
            </TabsContent>

            <TabsContent value="audit" className="mt-3">
              <Section title="Audit history">
                <DataTable
                  rows={(td.events as Record<string, unknown>[] | undefined) ?? []}
                  columns={[
                    { key: 'action', label: 'Action', render: (e) => <span className="font-mono text-caption">{e.action}</span> },
                    { key: 'actorName', label: 'Actor', render: (e) => `${e.actorName || e.actorType}` },
                    { key: 'severity', label: 'Severity', render: (e) => <StatusChip status={e.severity === 'critical' ? 'critical' : e.severity === 'warning' ? 'warning' : 'succeeded'} size="xs" /> },
                    { key: 'createdAt', label: 'When', render: (e) => fmtDate(e.createdAt) },
                  ]}
                />
              </Section>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}

async function startRun(agentId: string, agent: AgentBase) {
  try {
    const res = await api<{ executionId: string }>('/api/executions', { method: 'POST', body: { kind: 'agent', agentId, input: { prompt: `Run the standard ${agent.name} task.` } } })
    toast.success(`Execution started (${res.executionId.slice(-6)}) — watch it live in the Execution Center`)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Execution rejected')
  }
}

async function deployAgent(agentId: string) {
  try {
    const res = await api<{ approvalRequired?: boolean; reason?: string }>('/api/deployments', { method: 'POST', body: { op: 'deploy', agentId, environment: 'production', strategy: 'rolling' } })
    if (res.approvalRequired) toast.warning('Approval required: ' + (res.reason ?? 'policy gate'))
    else toast.success('Deployment created')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Deployment rejected')
  }
}

function ConfigTab({ agent, tabData, onSaved }: { agent: AgentBase; tabData: Record<string, unknown>; onSaved: () => void }) {
  const [prompt, setPrompt] = useState(agent.systemPrompt)
  const [autonomy, setAutonomy] = useState(agent.autonomyLevel)
  const [tools, setTools] = useState<Set<string>>(new Set(agent.toolPermissions))
  const [namespaces, setNamespaces] = useState<Set<string>>(new Set(agent.memoryConfig.namespaces ?? []))
  const [saving, setSaving] = useState(false)
  const allTools = (tabData.tools as Record<string, unknown>[] | undefined) ?? []
  const allNamespaces = (tabData.namespaces as Record<string, unknown>[] | undefined) ?? []
  const models = (tabData.models as Record<string, unknown>[] | undefined) ?? []
  const identities = (tabData.identities as Record<string, unknown>[] | undefined) ?? []

  const save = async () => {
    setSaving(true)
    try {
      await api(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        body: { systemPrompt: prompt, autonomyLevel: autonomy, toolPermissions: [...tools], memoryNamespaces: [...namespaces] },
      })
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <Section title="Instructions & autonomy" actions={
        <Button size="sm" className="radius-button" onClick={save} disabled={saving}><Save className="h-3.5 w-3.5 mr-1" />{saving ? 'Saving…' : 'Save config'}</Button>
      }>
        <div className="space-y-3">
          <div>
            <p className="text-micro text-muted-foreground mb-1.5">System prompt</p>
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={6} className="font-mono text-caption bg-panel" />
          </div>
          <div>
            <p className="text-micro text-muted-foreground mb-1.5">Autonomy level — high-impact actions always require approval regardless of confidence</p>
            <Select value={autonomy} onValueChange={setAutonomy}>
              <SelectTrigger className="radius-control bg-panel text-caption w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="A0">A0 · Observe (read-only reports)</SelectItem>
                <SelectItem value="A1">A1 · Recommend (propose actions)</SelectItem>
                <SelectItem value="A2">A2 · Human-approved (prepare, wait)</SelectItem>
                <SelectItem value="A3">A3 · Bounded autonomous</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="text-micro text-muted-foreground mb-1.5">Model routing</p>
            {models.map((m) => (
              <KV key={String(m.id)} k={`${String(m.provider)} · ${String(m.name)}`} v={<span className={m.role === 'primary' ? 'text-[#8B7CFF]' : 'text-muted-foreground'}>{String(m.role)} · ctx {fmtNum(Number(m.contextWindow))} · ${String(m.inputCostPerMtok)}/${String(m.outputCostPerMtok)} per Mtok</span>} />
            ))}
            {models.length === 0 && <p className="text-caption text-muted-foreground">No models configured.</p>}
          </div>
        </div>
      </Section>

      <div className="space-y-4">
        <Section title="Tool permissions" description="Unselected tools are denied by the deterministic policy layer, independent of the LLM.">
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {allTools.map((t) => (
              <label key={String(t.id)} className="flex items-center justify-between rounded-lg border border-border bg-panel px-3 py-2 cursor-pointer hover:border-[#8B7CFF]/40 motion-fast">
                <span className="flex items-center gap-2 text-caption">
                  <span className="font-medium">{String(t.name)}</span>
                  <RiskBadge level={String(t.riskClass)} />
                  {t.requiresApproval ? <span className="text-micro text-[#F2B95D]">approval-gated</span> : null}
                </span>
                <Switch
                  checked={tools.has(String(t.id))}
                  onCheckedChange={(v) => {
                    const next = new Set(tools)
                    if (v) next.add(String(t.id)); else next.delete(String(t.id))
                    setTools(next)
                  }}
                />
              </label>
            ))}
            {allTools.length === 0 && <p className="text-caption text-muted-foreground">No tools in registry yet.</p>}
          </div>
        </Section>

        <Section title="Memory namespaces" description="Retrieval is authorization-checked per record; undeclared namespaces are denied.">
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {allNamespaces.map((n) => (
              <label key={String(n.id)} className="flex items-center justify-between rounded-lg border border-border bg-panel px-3 py-2 cursor-pointer hover:border-[#8B7CFF]/40 motion-fast">
                <span className="text-caption"><span className="font-medium">{String(n.name)}</span> <span className="text-micro text-muted-foreground">({String(n.kind)} · {String(n.classification)})</span></span>
                <Switch
                  checked={namespaces.has(String(n.id))}
                  onCheckedChange={(v) => {
                    const next = new Set(namespaces)
                    if (v) next.add(String(n.id)); else next.delete(String(n.id))
                    setNamespaces(next)
                  }}
                />
              </label>
            ))}
          </div>
        </Section>

        <Section title="Workload identity">
          {identities.map((i) => (
            <KV key={String(i.id)} k={String(i.name)} v={<span className="font-mono text-caption">{String(i.keyFingerprint)} · scopes: {(i.scopes as string[]).join(', ')}</span>} mono />
          ))}
          {identities.length === 0 && <p className="text-caption text-muted-foreground">Identity is provisioned on first execution.</p>}
        </Section>
      </div>
    </div>
  )
}
