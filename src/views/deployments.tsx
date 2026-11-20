'use client'

import { api, useApi, fmtDate, timeAgo } from '@/lib/client'
import { PageHeader, Section, DataTable, StatusChip, ErrorNote, LoadingBlock, KV } from '@/components/mesh/kit'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/lib/client'
import { toast } from 'sonner'
import { Rocket, RotateCcw, HeartPulse } from 'lucide-react'

export function DeploymentsView() {
  const navigate = useAppStore((s) => s.navigate)
  const { data, error, loading, reload } = useApi<{
    deployments: Record<string, unknown>[]
    environments: Record<string, unknown>[]
    releaseGates: Record<string, unknown>[]
  }>('/api/deployments', { pollMs: 10000 })

  const verify = async (id: string) => {
    try {
      const res = await api<{ healthy: boolean; errorRate: number }>('api/deployments'.replace('api/', '/api/'), { method: 'POST', body: { op: 'verify_health', deploymentId: id } })
      toast.success(`Health check: ${res.healthy ? 'healthy' : 'degraded'} (error rate ${(res.errorRate * 100).toFixed(1)}%)`)
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  const rollback = async (id: string) => {
    try {
      await api('/api/deployments', { method: 'POST', body: { op: 'rollback', deploymentId: id } })
      toast.success('Rollback initiated — agent entering rolling_back state')
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  return (
    <div className="space-y-5" data-testid="deployments-view">
      <PageHeader title="Deployment Center" subtitle="Pipeline: draft → validation → evaluation gate → sandbox → staging → canary → production promotion → health verification. Failed mandatory evaluations block promotion." />
      {error && <ErrorNote message={error} />}

      <Section title="Release gates">
        <div className="flex flex-wrap gap-2">
          {(data?.releaseGates ?? []).map((g) => (
            <span key={String(g.gate)} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-caption ${g.requiresApproval ? 'border-[#F2B95D]/40 text-[#F2B95D]' : 'border-border text-muted-foreground'}`}>
              {String(g.gate)}
              {g.requiresApproval ? <span className="text-micro">· approval</span> : g.mandatory ? <span className="text-micro text-[#F06B7A]">· mandatory</span> : <span className="text-micro">· automated</span>}
            </span>
          ))}
        </div>
      </Section>

      <Section title="Deployments">
        {loading && !data ? <LoadingBlock /> : (
          <DataTable
            rows={data?.deployments ?? []}
            onRowClick={(d) => navigate('fleet', { agentId: String(d.agentId) })}
            columns={[
              { key: 'agentName', label: 'Agent', render: (d) => (
                <div><p className="font-medium">{d.agentName}</p><p className="text-micro text-muted-foreground font-mono">v{d.agentVersion}</p></div>
              ) },
              { key: 'environment', label: 'Environment', render: (d) => <span className="capitalize text-caption">{d.environment}</span> },
              { key: 'strategy', label: 'Strategy', render: (d) => <span className="text-caption">{d.strategy}{d.strategy === 'canary' ? ` · ${d.canaryPct}%` : ''}</span> },
              { key: 'status', label: 'Status', render: (d) => <StatusChip status={d.status} size="xs" /> },
              { key: 'errorRate', label: 'Errors', align: 'right', render: (d) => `${Math.round((d.errorRate as number) * 100)}%` },
              { key: 'evalScore', label: 'Eval gate', align: 'right', render: (d) => `${Math.round((d.evalScore as number) * 100)}%` },
              { key: 'updatedAt', label: 'Updated', render: (d) => timeAgo(d.updatedAt) },
              { key: 'actions', label: '', align: 'right', render: (d) => (
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="sm" className="h-7 px-1.5" title="Verify health" onClick={() => verify(String(d.id))}><HeartPulse className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="sm" className="h-7 px-1.5 text-[#F06B7A] hover:text-[#F06B7A]" title="Rollback" onClick={() => rollback(String(d.id))}><RotateCcw className="h-3.5 w-3.5" /></Button>
                </div>
              ) },
            ]}
          />
        )}
      </Section>

      <Section title="Promotion flow">
        <p className="text-caption text-muted-foreground">Promote agents to production from the Agent detail → Deployments tab. Production promotions trigger the <span className="text-[#F2B95D]">Production deployment gate</span> policy: a named reviewer must approve, and the evaluation suite must pass before the deployment proceeds.</p>
      </Section>
    </div>
  )
}
