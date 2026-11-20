'use client'

import { api, useApi, fmtUsd } from '@/lib/client'
import { PageHeader, Section, StatusChip, ErrorNote, LoadingBlock, KV } from '@/components/mesh/kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { useState } from 'react'

interface SettingsData {
  workspace: { id: string; name: string; slug: string; description: string; monthlyBudget: number; dataClassification: string } | null
  organization: { name: string; planTier: string; dataResidency: string } | null
  agentCount: number
  role: string
  runtime: Record<string, string>
}

export function SettingsView() {
  const { data, error, loading, reload } = useApi<SettingsData>('/api/settings')
  const [budget, setBudget] = useState('')
  const [classification, setClassification] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const body: Record<string, unknown> = {}
      if (budget) body.monthlyBudget = Number(budget)
      if (classification) body.dataClassification = classification
      await api('/api/settings', { method: 'PATCH', body })
      toast.success('Workspace settings updated (audited)')
      setBudget(''); setClassification('')
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  const w = data?.workspace

  return (
    <div className="space-y-5" data-testid="settings-view">
      <PageHeader title="Settings" subtitle="Workspace configuration, tenancy boundaries and runtime transparency." />
      {error && <ErrorNote message={error} />}
      {loading && !data ? <LoadingBlock rows={5} /> : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Section title="Workspace">
              <KV k="Name" v={w?.name} />
              <KV k="Slug" v={w?.slug} mono />
              <KV k="Description" v={w?.description} />
              <KV k="Registered agents" v={data?.agentCount} />
              <KV k="Your role" v={<StatusChip status={data?.role === 'owner' ? 'succeeded' : data?.role === 'admin' ? 'ready' : data?.role === 'operator' ? 'queued' : 'draft'} size="xs" />} />
              <div className="grid grid-cols-2 gap-2 mt-4">
                <div className="space-y-1.5">
                  <Label className="text-caption">Monthly budget (USD)</Label>
                  <Input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder={String(w?.monthlyBudget ?? '')} className="radius-control bg-panel tnum" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-caption">Data classification ceiling</Label>
                  <Select value={classification || w?.dataClassification || 'internal'} onValueChange={setClassification}>
                    <SelectTrigger className="radius-control bg-panel text-caption"><SelectValue /></SelectTrigger>
                    <SelectContent>{['public', 'internal', 'confidential', 'restricted'].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <Button className="radius-button mt-3" onClick={save} disabled={saving || (!budget && !classification)}>
                {saving ? 'Saving…' : 'Save workspace settings'}
              </Button>
              <p className="text-micro text-muted-foreground mt-2">Admin role required. Changes are recorded in the Audit Center.</p>
            </Section>

            <Section title="Organization">
              <KV k="Name" v={data?.organization?.name} />
              <KV k="Plan tier" v={data?.organization?.planTier} />
              <KV k="Data residency" v={data?.organization?.dataResidency} />
              <div className="mt-3 rounded-lg border border-border bg-panel p-3">
                <p className="text-caption font-medium mb-1.5">Tenancy model</p>
                <p className="text-caption text-muted-foreground">Organization → Workspace → Project → Environment → Agent → Deployment → Execution. Cross-tenant access is denied by default and tested explicitly; secret scopes, retention and usage attribution follow workspace boundaries.</p>
              </div>
            </Section>
          </div>

          <Section title="Runtime transparency" description="Honest status of this deployment — what is real, and what is roadmap">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {Object.entries(data?.runtime ?? {}).map(([k, v]) => <KV key={k} k={k} v={v} />)}
            </div>
            <div className="mt-4 rounded-lg border border-border bg-panel p-3 text-caption text-muted-foreground space-y-1.5">
              <p><span className="text-foreground font-medium">Real in this build:</span> control plane (registry, versions, deployments), deterministic policy engine, identity + RBAC, human approvals, durable execution checkpoints, tool runtime with schema validation and redaction, memory with authorization checks, evaluation lab, metering/billing, audit trail, security monitoring with emergency controls.</p>
              <p><span className="text-foreground font-medium">Roadmap (documented, not faked):</span> external Postgres/Redis/NATS/Temporal backends, microVM/gVisor sandbox isolation, real provider credentials (GLM provider is live via the platform SDK), SSO/SCIM, multi-region recovery, independent penetration testing.</p>
            </div>
          </Section>
        </>
      )}
    </div>
  )
}
