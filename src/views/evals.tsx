'use client'

import { api, useApi, fmtDate, fmtMs, fmtUsd } from '@/lib/client'
import { PageHeader, Section, DataTable, StatusChip, ErrorNote, LoadingBlock, Json, EmptyState } from '@/components/mesh/kit'
import { TrendLine } from '@/components/mesh/charts'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { useState } from 'react'
import { FlaskConical, Plus } from 'lucide-react'

interface DatasetRow extends Record<string, unknown> {
  id: string; name: string; description: string; category: string; caseCount: number;
  cases: { id: string; name: string; evaluator: string; weight: number; expected: { contains?: string[]; notContains?: string[] } }[];
  runs: { id: string; label: string; status: string; passRate: number; avgScore: number; avgLatencyMs: number; totalCost: number; startedAt: string; agentVersion: string | null; agentId: string | null }[];
}

export function EvalsView() {
  const { data, error, loading, reload } = useApi<{ datasets: DatasetRow[]; agents: { id: string; name: string }[]; comparisons: Record<string, unknown>[] }>('/api/evals')
  const [selectedDs, setSelectedDs] = useState('')
  const [agentId, setAgentId] = useState('')
  const [running, setRunning] = useState(false)

  const datasets = data?.datasets ?? []
  const ds = datasets.find((d) => d.id === selectedDs) ?? datasets[0]
  const comparisons = ds ? (data?.comparisons ?? []) : []

  const run = async () => {
    if (!ds || !agentId) return
    setRunning(true)
    try {
      const res = await api<{ runId: string }>('/api/evals', { method: 'POST', body: { op: 'run', datasetId: ds.id, agentId, label: `${ds.name} × ${new Date().toLocaleTimeString()}` } })
      toast.success(`Suite executed (${res.runId.slice(-6)}) — deterministic evaluators only`)
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Eval run failed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-5" data-testid="evals-view">
      <PageHeader
        title="Evaluation Lab"
        subtitle="Independent testing environment: deterministic datasets, regression suites, safety scans and version comparisons. Model-based judges require documented methodology — this lab stays deterministic and auditable."
        badge={<span className="text-micro text-[#39C7B2]">flagship</span>}
      />
      {error && <ErrorNote message={error} />}

      <div className="flex items-center gap-2 flex-wrap">
        <Select value={ds?.id ?? ''} onValueChange={setSelectedDs}>
          <SelectTrigger className="h-9 w-72 radius-control bg-panel text-caption"><SelectValue placeholder="Dataset" /></SelectTrigger>
          <SelectContent>
            {datasets.map((d) => <SelectItem key={d.id} value={d.id}>{d.name} ({d.caseCount} cases)</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={agentId} onValueChange={setAgentId}>
          <SelectTrigger className="h-9 w-56 radius-control bg-panel text-caption"><SelectValue placeholder="Target agent" /></SelectTrigger>
          <SelectContent>
            {(data?.agents ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button className="radius-button" disabled={!ds || !agentId || running} onClick={run}><FlaskConical className="h-4 w-4 mr-1" />{running ? 'Running…' : 'Run suite'}</Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Section title="Dataset cases" description={ds ? `${ds.category} · ${ds.caseCount} deterministic cases` : undefined}>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {(ds?.cases ?? []).map((c) => (
              <div key={c.id} className="rounded-lg border border-border bg-panel px-3 py-2">
                <p className="text-caption font-medium">{c.name} <span className="text-micro text-muted-foreground">weight {c.weight}</span></p>
                <p className="text-micro text-muted-foreground mt-1 font-mono">
                  {c.expected.contains?.length ? `contains: ${c.expected.contains.join(', ')}` : ''}
                  {c.expected.notContains?.length ? ` forbids: ${c.expected.notContains.join(', ')}` : ''}
                </p>
              </div>
            ))}
            {(ds?.cases ?? []).length === 0 && <EmptyState title="No cases" />}
          </div>
        </Section>

        <Section title="Run history">
          <DataTable
            rows={(ds?.runs ?? []) as unknown as Record<string, unknown>[]}
            columns={[
              { key: 'label', label: 'Run', render: (r) => <span className="text-caption">{String(r.label).slice(0, 36)}</span> },
              { key: 'status', label: 'Status', render: (r) => <StatusChip status={r.status} size="xs" /> },
              { key: 'passRate', label: 'Pass', align: 'right', render: (r) => `${Math.round((r.passRate as number) * 100)}%` },
              { key: 'avgLatencyMs', label: 'Latency', align: 'right', render: (r) => fmtMs(r.avgLatencyMs) },
              { key: 'startedAt', label: 'When', render: (r) => fmtDate(r.startedAt) },
            ]}
          />
        </Section>
      </div>

      {comparisons.length > 0 && (
        <Section title="Version & prompt comparison" description="Pass rate by run — regression detection across agent versions">
          <TrendLine
            data={[...comparisons].reverse().map((c) => ({ day: String(c.label).slice(0, 18), passRate: Math.round((c.passRate as number) * 100), score: Math.round((c.avgScore as number) * 100) }))}
            keys={[{ key: 'passRate', label: 'Pass rate %', color: '#8B7CFF' }, { key: 'score', label: 'Avg score %', color: '#39C7B2' }]}
            height={180}
          />
        </Section>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Section title="All datasets">
          <DataTable
            rows={datasets as unknown as Record<string, unknown>[]}
            onRowClick={(d) => setSelectedDs(String(d.id))}
            columns={[
              { key: 'name', label: 'Dataset', render: (d) => (
                <div><p className="font-medium">{d.name}</p><p className="text-micro text-muted-foreground truncate max-w-[240px]">{d.description}</p></div>
              ) },
              { key: 'category', label: 'Category', render: (d) => <span className="text-caption">{d.category}</span> },
              { key: 'caseCount', label: 'Cases', align: 'right' },
              { key: 'runs', label: 'Runs', align: 'right', render: (d) => (d.runs as unknown[]).length },
            ]}
          />
        </Section>
        <Section title="Latest completed run detail">
          {(() => {
            const latest = ds?.runs?.[0]
            if (!latest) return <EmptyState title="No runs yet" hint="Execute the suite against an agent to see deterministic check results." />
            return (
              <div className="text-caption text-muted-foreground">
                <p>Latest: <span className="text-foreground">{latest.label}</span> · pass {Math.round(latest.passRate * 100)}% · score {latest.avgScore.toFixed(2)} · cost {fmtUsd(latest.totalCost)}</p>
                <p className="mt-2">Deterministic checks per case: keyword containment, forbidden patterns, format assertions, refusal scan and latency bounds. Failures are stored with per-check evidence for regression triage.</p>
              </div>
            )
          })()}
        </Section>
      </div>
    </div>
  )
}
