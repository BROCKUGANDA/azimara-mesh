'use client'

import { api, useApi, fmtNum, fmtUsd } from '@/lib/client'
import { PageHeader, Section, DataTable, StatusChip, ErrorNote, LoadingBlock } from '@/components/mesh/kit'
import { Donut, CostBars } from '@/components/mesh/charts'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useState } from 'react'
import { Plug, Unplug } from 'lucide-react'

interface ModelRow extends Record<string, unknown> {
  id: string; name: string; modelId: string; provider: string; providerSlug: string; providerStatus: string;
  contextWindow: number; maxOutputTokens: number; inputCostPerMtok: number; outputCostPerMtok: number;
  capabilities: string[]; taskClasses: string[]; status: string; tokens: number; cost: number;
}

export function ModelsView() {
  const { data, error, loading } = useApi<{
    providers: { id: string; name: string; slug: string; kind: string; status: string; latencyMs: number; errorRate: number; byok: boolean }[]
    models: ModelRow[]
    connections: { id: string; name: string; provider: string; providerSlug: string; authMode: string; status: string; secretRef: string | null; lastCheckedAt: string | null }[]
    routingRules: { id: string; name: string; effect: string; description: string }[]
  }>('/api/models')
  const [connecting, setConnecting] = useState<string | null>(null)

  const connect = async (providerId: string) => {
    try {
      await api('/api/models', { method: 'POST', body: { op: 'connect', providerId, authMode: 'byok' } })
      toast.success('Connection created — verify the credential to activate')
      setConnecting(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Connect failed')
    }
  }

  const test = async (connectionId: string) => {
    try {
      const res = await api<{ ok: boolean; note: string }>('/api/models', { method: 'POST', body: { op: 'test', connectionId } })
      if (res.ok) toast.success(res.note)
      else toast.warning(res.note)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test failed')
    }
  }

  const disconnect = async (connectionId: string) => {
    try {
      await api('/api/models', { method: 'POST', body: { op: 'disconnect', connectionId } })
      toast.success('Connection removed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  return (
    <div className="space-y-5" data-testid="models-view">
      <PageHeader title="Model Hub" subtitle="Provider-neutral gateway: BYOK connections, capability metadata, health, pricing, policy-based routing and fallback chains." />
      {error && <ErrorNote message={error} />}

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        {(data?.providers ?? []).map((p) => (
          <div key={p.id} className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-body-sm font-medium truncate">{p.name}</p>
            </div>
            <StatusChip status={p.status} size="xs" />
            <p className="text-micro text-muted-foreground tnum mt-1.5">{p.latencyMs}ms · err {(p.errorRate * 100).toFixed(1)}%</p>
            {p.status !== 'connected' && (
              connecting === p.id
                ? <Button size="sm" className="h-6 mt-2 w-full radius-button text-micro" onClick={() => connect(p.id)}>Confirm BYOK</Button>
                : <Button size="sm" variant="outline" className="h-6 mt-2 w-full radius-button text-micro" onClick={() => setConnecting(p.id)}><Plug className="h-3 w-3 mr-1" />Connect</Button>
            )}
          </div>
        ))}
      </div>

      <Section title="Connections" description="Platform-managed or Bring Your Own Key. Secrets live in the brokerage; raw keys are never displayed.">
        <DataTable
          rows={(data?.connections ?? []) as unknown as Record<string, unknown>[]}
          columns={[
            { key: 'name', label: 'Connection' },
            { key: 'provider', label: 'Provider' },
            { key: 'authMode', label: 'Auth', render: (c) => <span className={c.authMode === 'byok' ? 'text-[#F2B95D] text-caption' : 'text-caption'}>{c.authMode === 'byok' ? 'BYOK' : 'platform'}</span> },
            { key: 'status', label: 'Status', render: (c) => <StatusChip status={c.status === 'connected' ? 'connected' : c.status} size="xs" /> },
            { key: 'secretRef', label: 'Secret ref', render: (c) => <span className="font-mono text-micro text-muted-foreground">{c.secretRef ?? '—'}</span> },
            { key: 'actions', label: '', align: 'right', render: (c) => (
              <div className="flex justify-end gap-1.5">
                <Button size="sm" variant="outline" className="h-7 radius-button text-caption" onClick={() => test(String(c.id))}>Test</Button>
                <Button size="sm" variant="ghost" className="h-7 text-[#F06B7A] hover:text-[#F06B7A]" onClick={() => disconnect(String(c.id))}><Unplug className="h-3.5 w-3.5" /></Button>
              </div>
            ) },
          ]}
        />
      </Section>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
        <Section title="Model catalog" description="Capability, context and pricing metadata used by the routing engine">
          <DataTable
            rows={data?.models ?? []}
            columns={[
              { key: 'name', label: 'Model', render: (m) => (
                <div>
                  <p className="font-medium">{m.name}</p>
                  <p className="text-micro text-muted-foreground font-mono">{m.provider} / {m.modelId}</p>
                </div>
              ) },
              { key: 'contextWindow', label: 'Context', align: 'right', render: (m) => `${Math.round((m.contextWindow as number) / 1000)}k` },
              { key: 'inputCostPerMtok', label: 'In $/Mtok', align: 'right', render: (m) => `$${m.inputCostPerMtok}` },
              { key: 'outputCostPerMtok', label: 'Out $/Mtok', align: 'right', render: (m) => `$${m.outputCostPerMtok}` },
              { key: 'capabilities', label: 'Capabilities', render: (m) => <span className="text-caption text-muted-foreground">{(m.capabilities as string[]).slice(0, 3).join(', ')}</span> },
              { key: 'tokens', label: 'Tokens (30d)', align: 'right', render: (m) => fmtNum(m.tokens) },
              { key: 'cost', label: 'Cost (30d)', align: 'right', render: (m) => fmtUsd(m.cost) },
              { key: 'providerStatus', label: 'Health', render: (m) => <StatusChip status={m.providerStatus} size="xs" /> },
            ]}
          />
        </Section>
        <div className="space-y-4">
          <Section title="Routing rules" description="Deterministic policy layer">
            <div className="space-y-2">
              {(data?.routingRules ?? []).map((r) => (
                <div key={r.id} className="rounded-lg border border-border bg-panel p-2.5">
                  <p className="text-caption font-medium">{r.name} <span className={`ml-1.5 text-micro ${r.effect === 'deny' ? 'text-[#F06B7A]' : 'text-[#F2B95D]'}`}>{r.effect.replace('_', ' ')}</span></p>
                  <p className="text-micro text-muted-foreground mt-0.5">{r.description}</p>
                </div>
              ))}
            </div>
          </Section>
          <Section title="Token mix (30d)">
            <Donut data={(data?.models ?? []).filter((m) => m.tokens > 0).slice(0, 5).map((m, i) => ({ name: m.name, value: m.tokens, color: ['#8B7CFF', '#42D9E8', '#39C7B2', '#5D8CFF', '#F2B95D'][i] }))} />
          </Section>
        </div>
      </div>
    </div>
  )
}
