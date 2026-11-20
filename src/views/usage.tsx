'use client'

import { useApi, fmtUsd } from '@/lib/client'
import { PageHeader, Section, DataTable, ErrorNote, LoadingBlock, MetricCard } from '@/components/mesh/kit'
import { CostBars, UsageArea } from '@/components/mesh/charts'
import { Progress } from '@/components/ui/progress'

interface Breakdown {
  month: string; spent: number; cap: number; forecast: number;
  byKind: { kind: string; cost: number; quantity: number }[]
  byAgent: { agentId: string; name: string; cost: number }[]
  byModel: { modelId: string; name: string; cost: number; tokens: number }[]
  byTool: { toolId: string; name: string; cost: number; calls: number }[]
  daily: { day: string; cost: number }[]
}

export function UsageView() {
  const { data, error, loading } = useApi<{ breakdown: Breakdown; spend: number; warnings: string[] }>('/api/usage')
  const b = data?.breakdown
  const spendPct = b && b.cap > 0 ? Math.min(100, Math.round((b.spent / b.cap) * 100)) : 0
  const forecastPct = b && b.cap > 0 ? Math.min(100, Math.round((b.forecast / b.cap) * 100)) : 0

  return (
    <div className="space-y-5" data-testid="usage-view">
      <PageHeader title="Usage & Costs" subtitle="Transparent consumption metering: seats, agents, executions, tokens, tool invocations, memory reads and storage — attributed per workspace, agent, model and tool." />
      {error && <ErrorNote message={error} />}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Month to date" value={fmtUsd(b?.spent)} accent="violet" loading={loading} />
        <MetricCard label="Forecast (month end)" value={fmtUsd(b?.forecast)} accent={(b?.forecast ?? 0) > (b?.cap ?? 0) ? 'danger' : 'cyan'} loading={loading} />
        <MetricCard label="Workspace cap" value={fmtUsd(b?.cap)} accent="blue" loading={loading} />
        <MetricCard label="Metered kinds" value={b?.byKind.length ?? '—'} accent="teal" sub="execution · tokens · tools · memory · storage" loading={loading} />
      </div>

      {(data?.warnings ?? []).length > 0 && (
        <div className="rounded-lg border border-[#F2B95D]/30 bg-[#F2B95D]/10 px-3 py-2.5">
          {(data?.warnings ?? []).map((w, i) => <p key={i} className="text-caption text-[#F2B95D]">Budget alert: {w}</p>)}
        </div>
      )}

      <Section title="Budget consumption">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="flex justify-between text-caption mb-1.5"><span className="text-muted-foreground">Month to date</span><span className="tnum">{fmtUsd(b?.spent)} / {fmtUsd(b?.cap)}</span></div>
            <Progress value={spendPct} className="h-2.5" />
          </div>
          <div>
            <div className="flex justify-between text-caption mb-1.5"><span className="text-muted-foreground">Forecast trajectory</span><span className="tnum">{fmtUsd(b?.forecast)}</span></div>
            <Progress value={forecastPct} className="h-2.5" />
          </div>
        </div>
      </Section>

      <Section title="Daily spend" description="Current month, metered from idempotent usage events">
        {b ? <UsageArea data={b.daily.map((d) => ({ day: d.day, cost: d.cost }))} keys={[{ key: 'cost', label: 'USD', color: '#8B7CFF' }]} height={200} /> : <LoadingBlock />}
      </Section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Section title="By agent">
          {b ? <CostBars data={b.byAgent.slice(0, 8) as unknown as Record<string, unknown>[]} /> : <LoadingBlock />}
        </Section>
        <Section title="By model">
          {b ? <CostBars data={b.byModel.slice(0, 8) as unknown as Record<string, unknown>[]} color="#42D9E8" /> : <LoadingBlock />}
        </Section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Section title="Metered kinds">
          <DataTable
            rows={(b?.byKind ?? []) as unknown as Record<string, unknown>[]}
            columns={[
              { key: 'kind', label: 'Kind', render: (k) => <span className="font-mono text-caption">{k.kind}</span> },
              { key: 'quantity', label: 'Quantity', align: 'right', render: (k) => Math.round((k.quantity as number) * 100) / 100 },
              { key: 'cost', label: 'Cost', align: 'right', render: (k) => fmtUsd(k.cost) },
            ]}
          />
        </Section>
        <Section title="By tool">
          <DataTable
            rows={(b?.byTool ?? []) as unknown as Record<string, unknown>[]}
            columns={[
              { key: 'name', label: 'Tool' },
              { key: 'calls', label: 'Calls', align: 'right' },
              { key: 'cost', label: 'Cost', align: 'right', render: (t) => fmtUsd(t.cost) },
            ]}
          />
        </Section>
      </div>
    </div>
  )
}
