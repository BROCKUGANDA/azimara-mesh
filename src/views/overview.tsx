'use client'

import { api, useApi, fmtUsd, fmtMs, timeAgo } from '@/lib/client'
import { PageHeader, Section, MetricCard, StatusChip, HealthDot, SeededNote, LoadingBlock, ErrorNote } from '@/components/mesh/kit'
import { UsageArea } from '@/components/mesh/charts'
import { useAppStore } from '@/lib/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ArrowRight, ShieldAlert, BadgeCheck } from 'lucide-react'

interface OverviewData {
  agents: { total: number; active: number; degraded: number; paused: number }
  executions: { total: number; succeeded: number; failed: number; running: number; waitingApproval: number }
  successRate: number
  avgDurationMs: number
  evalPassRate: number | null
  governance: { pendingApprovals: number; securityIncidents: number }
  spend: { monthToDate: number; cap: number; currency: string }
  providers: { name: string; slug: string; status: string; latencyMs: number; errorRate: number }[]
  daily: { day: string; total: number; failed: number; cost: number }[]
  fleets: { id: string; name: string; status: string; agents: number; healthyAgents: number; avgSuccessRate: number; spend: number; budget: number; members: { id: string; name: string; status: string; health: string }[] }[]
  seededDemoData: boolean
}

export function OverviewView() {
  const navigate = useAppStore((s) => s.navigate)
  const refreshKey = useAppStore((s) => s.refreshKey)
  const { data, error, loading } = useApi<OverviewData>('/api/overview', { pollMs: 15000, refreshKey })
  const d = data

  const successPct = d ? Math.round(d.successRate * 100) : 0
  const spendPct = d && d.spend.cap > 0 ? Math.min(100, Math.round((d.spend.monthToDate / d.spend.cap) * 100)) : 0

  return (
    <div className="space-y-5" data-testid="overview-view">
      <PageHeader
        title="Fleet Overview"
        subtitle="Operational command center for your agent fleet. Every metric links to the underlying records."
        badge={<Badge variant="outline" className="text-micro text-muted-foreground">live · refreshes 15s</Badge>}
      />

      {error && <ErrorNote message={error} />}

      {/* Metric grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <MetricCard label="Registered agents" value={d?.agents.total ?? '—'} accent="violet" loading={loading} onClick={() => navigate('fleet')} />
        <MetricCard label="Active agents" value={d?.agents.active ?? '—'} accent="cyan" sub={d ? `${d.agents.degraded} degraded · ${d.agents.paused} paused` : ''} loading={loading} onClick={() => navigate('fleet')} />
        <MetricCard label="Executions (30d)" value={d?.executions.total ?? '—'} accent="blue" sub={d ? `${d.executions.running} running · ${d.executions.waitingApproval} awaiting approval` : ''} loading={loading} onClick={() => navigate('executions')} />
        <MetricCard label="Success rate" value={d ? `${successPct}%` : '—'} accent={successPct >= 85 ? 'success' : 'warning'} sub={d ? `${d.executions.failed} failed in period` : ''} loading={loading} onClick={() => navigate('executions')} />
        <MetricCard label="Eval pass rate" value={d?.evalPassRate !== null && d ? `${Math.round(d.evalPassRate * 100)}%` : 'no runs'} accent="teal" sub="last 10 completed suites" loading={loading} onClick={() => navigate('evals')} />
        <MetricCard label="Month-to-date spend" value={fmtUsd(d?.spend.monthToDate)} accent={spendPct >= 90 ? 'danger' : 'violet'} sub={d ? `of ${fmtUsd(d.spend.cap)} cap` : ''} loading={loading} onClick={() => navigate('usage')} />
      </div>

      {d?.seededDemoData && <SeededNote />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Execution volume */}
        <Section title="Execution volume" description="Last 14 days — total vs failed (all environments)" className="lg:col-span-2">
          {loading && !d ? <LoadingBlock /> : (
            <>
              <UsageArea
                data={(d?.daily ?? []).map((x) => ({ day: x.day, total: x.total, failed: x.failed }))}
                keys={[{ key: 'total', label: 'Executions', color: '#8B7CFF' }, { key: 'failed', label: 'Failed', color: '#F06B7A' }]}
                height={200}
              />
              <div className="mt-2 flex items-center justify-between text-caption text-muted-foreground">
                <span>Avg duration {fmtMs(d?.avgDurationMs)}</span>
                <Button variant="ghost" size="sm" className="h-7 text-caption text-[#8B7CFF]" onClick={() => navigate('executions')}>
                  Open Execution Center <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </>
          )}
        </Section>

        {/* Governance */}
        <Section title="Governance & trust">
          <div className="space-y-3">
            <button onClick={() => navigate('executions', { status: 'waiting_approval' })} className="w-full flex items-center justify-between rounded-lg border border-border bg-panel px-3 py-3 hover:border-[#F2B95D]/40 motion-fast">
              <div className="flex items-center gap-2.5">
                <BadgeCheck className="h-4.5 w-4.5 text-[#F2B95D]" />
                <div className="text-left">
                  <p className="text-body-sm font-medium">Pending approvals</p>
                  <p className="text-micro text-muted-foreground">Tool usage, deployments, financial ops</p>
                </div>
              </div>
              <span className="text-h3 tnum text-[#F2B95D]">{d?.governance.pendingApprovals ?? '—'}</span>
            </button>
            <button onClick={() => navigate('security')} className="w-full flex items-center justify-between rounded-lg border border-border bg-panel px-3 py-3 hover:border-[#F06B7A]/40 motion-fast">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="h-4.5 w-4.5 text-[#F06B7A]" />
                <div className="text-left">
                  <p className="text-body-sm font-medium">Open security incidents</p>
                  <p className="text-micro text-muted-foreground">Injection, permission, cost anomalies</p>
                </div>
              </div>
              <span className="text-h3 tnum text-[#F06B7A]">{d?.governance.securityIncidents ?? '—'}</span>
            </button>
            <div>
              <div className="flex items-center justify-between text-caption mb-1.5">
                <span className="text-muted-foreground">Budget consumption</span>
                <span className="tnum">{fmtUsd(d?.spend.monthToDate)} / {fmtUsd(d?.spend.cap)}</span>
              </div>
              <Progress value={spendPct} className="h-2" />
            </div>
          </div>
        </Section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Fleets */}
        <Section title="Fleet health" className="lg:col-span-2">
          {loading && !d ? <LoadingBlock /> : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(d?.fleets ?? []).map((f) => (
                <button key={f.id} onClick={() => navigate('fleet')} className="rounded-lg border border-border bg-panel p-3 text-left hover:border-[#8B7CFF]/40 motion-fast">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-body-sm font-medium">{f.name}</p>
                    <StatusChip status={f.status} size="xs" />
                  </div>
                  <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                    {f.members.slice(0, 8).map((m) => <HealthDot key={m.id} status={m.health} />)}
                    <span className="text-micro text-muted-foreground ml-1">{f.healthyAgents}/{f.agents} healthy</span>
                  </div>
                  <div className="flex items-center justify-between text-micro text-muted-foreground">
                    <span className="tnum">success {Math.round(f.avgSuccessRate * 100)}%</span>
                    <span className="tnum">{fmtUsd(f.spend)} / {fmtUsd(f.budget)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Section>

        {/* Provider health */}
        <Section title="Model provider health">
          <div className="space-y-2">
            {(d?.providers ?? []).map((p) => (
              <div key={p.slug} className="flex items-center justify-between rounded-lg border border-border bg-panel px-3 py-2">
                <div className="min-w-0">
                  <p className="text-body-sm truncate">{p.name}</p>
                  <p className="text-micro text-muted-foreground tnum">{p.latencyMs}ms · err {(p.errorRate * 100).toFixed(1)}%</p>
                </div>
                <StatusChip status={p.status} size="xs" />
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  )
}
