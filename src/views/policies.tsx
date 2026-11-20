'use client'

// Policy Center — inventory, editor, autonomy controls, simulation with "why" evidence.

import { api, useApi, fmtDate } from '@/lib/client'
import { PageHeader, Section, DataTable, StatusChip, ErrorNote, LoadingBlock, Json, KV } from '@/components/mesh/kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { useState } from 'react'
import { Plus, ShieldCheck, ShieldX, UserCheck } from 'lucide-react'

interface PolicyRow extends Record<string, unknown> {
  id: string; name: string; kind: string; effect: string; priority: number; description: string; status: string;
  rules: { field: string; operator: string; value: unknown }[];
  updatedAt: string;
}

export function PoliciesView() {
  const { data, error, loading, reload } = useApi<{ policies: PolicyRow[]; recentDecisions: Record<string, unknown>[] }>('/api/policies')
  const [createOpen, setCreateOpen] = useState(false)

  const toggleStatus = async (p: PolicyRow) => {
    try {
      await api('/api/policies', { method: 'POST', body: { op: 'update', id: p.id, status: p.status === 'active' ? 'disabled' : 'active' } })
      toast.success(`Policy ${p.status === 'active' ? 'disabled' : 'activated'}`)
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  return (
    <div className="space-y-5" data-testid="policies-view">
      <PageHeader
        title="Policies & Guardrails"
        subtitle="Deterministic evaluation on every consequential action — deny-wins ordering, approval gates, budget rules and model restrictions. Independent of any LLM."
        actions={<Button className="radius-button" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" />New policy</Button>}
      />
      {error && <ErrorNote message={error} />}

      <Section title="Policy inventory">
        {loading && !data ? <LoadingBlock /> : (
          <DataTable
            rows={data?.policies ?? []}
            columns={[
              { key: 'name', label: 'Policy', render: (p) => (
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-micro text-muted-foreground truncate max-w-[340px]">{p.description}</p>
                </div>
              ) },
              { key: 'effect', label: 'Effect', render: (p) => (
                <span className={`text-caption font-medium ${p.effect === 'deny' ? 'text-[#F06B7A]' : p.effect === 'require_approval' ? 'text-[#F2B95D]' : 'text-[#35C991]'}`}>{p.effect.replace('_', ' ')}</span>
              ) },
              { key: 'kind', label: 'Kind', render: (p) => <span className="text-caption">{p.kind}</span> },
              { key: 'priority', label: 'Priority', align: 'right', render: (p) => <span className="tnum">{p.priority}</span> },
              { key: 'rules', label: 'Rules', render: (p) => <span className="font-mono text-micro text-muted-foreground">{p.rules.map((r) => `${r.field} ${r.operator} ${Array.isArray(r.value) ? `[${r.value.join('|')}]` : String(r.value)}`).join(' AND ').slice(0, 60)}</span> },
              { key: 'status', label: 'Status', render: (p) => <StatusChip status={p.status} size="xs" /> },
              { key: 'actions', label: '', align: 'right', render: (p) => (
                <Switch checked={p.status === 'active'} onCheckedChange={() => toggleStatus(p)} aria-label="toggle policy" />
              ) },
            ]}
          />
        )}
      </Section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <PolicySimulator />
        <Section title="Recent decisions" description="Latest policy evaluations with exact reasons">
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {(data?.recentDecisions ?? []).map((d) => (
              <div key={String(d.id)} className="rounded-lg border border-border bg-panel p-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusChip status={d.decision === 'allow' ? 'succeeded' : d.decision === 'deny' ? 'denied' : 'pending'} size="xs" />
                  <span className="text-caption font-medium">{String(d.policyName)}</span>
                  <span className="text-micro text-muted-foreground">{String(d.action)} · {fmtDate(String(d.createdAt))}</span>
                </div>
                <p className="text-micro text-muted-foreground mt-1">{String(d.reason)}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <CreatePolicyDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={() => reload()} />
    </div>
  )
}

function PolicySimulator() {
  const [action, setAction] = useState('tool_invoke')
  const [environment, setEnvironment] = useState('production')
  const [dataClass, setDataClass] = useState('internal')
  const [toolRisk, setToolRisk] = useState('high')
  const [provider, setProvider] = useState('openai')
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [busy, setBusy] = useState(false)

  const simulate = async () => {
    setBusy(true)
    try {
      const res = await api<{ verdict: Record<string, unknown> }>('/api/policies', {
        method: 'POST',
        body: {
          op: 'simulate',
          simulation: {
            action, environment, dataClass, autonomyLevel: 'A2', estimatedCostUsd: 0.5,
            metadata: { toolRiskClass: toolRisk, toolSlug: 'simulated-tool', provider },
          },
        },
      })
      setResult(res.verdict)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Simulation failed')
    } finally {
      setBusy(false)
    }
  }

  const decision = result?.decision as string | undefined

  return (
    <Section title="Policy simulation" description="Test a decision path before changing anything — see exactly why a decision is made">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <div className="space-y-1">
          <Label className="text-micro text-muted-foreground">Action</Label>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="h-8 radius-control bg-panel text-caption"><SelectValue /></SelectTrigger>
            <SelectContent>{['tool_invoke', 'model_route', 'deployment', 'memory_read'].map((a) => <SelectItem key={a} value={a}>{a.replace('_', ' ')}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-micro text-muted-foreground">Environment</Label>
          <Select value={environment} onValueChange={setEnvironment}>
            <SelectTrigger className="h-8 radius-control bg-panel text-caption"><SelectValue /></SelectTrigger>
            <SelectContent>{['development', 'staging', 'production'].map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-micro text-muted-foreground">Data class</Label>
          <Select value={dataClass} onValueChange={setDataClass}>
            <SelectTrigger className="h-8 radius-control bg-panel text-caption"><SelectValue /></SelectTrigger>
            <SelectContent>{['public', 'internal', 'confidential', 'restricted'].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-micro text-muted-foreground">Tool risk</Label>
          <Select value={toolRisk} onValueChange={setToolRisk}>
            <SelectTrigger className="h-8 radius-control bg-panel text-caption"><SelectValue /></SelectTrigger>
            <SelectContent>{['low', 'medium', 'high', 'critical'].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1">
          <Label className="text-micro text-muted-foreground">Provider</Label>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger className="h-8 radius-control bg-panel text-caption"><SelectValue /></SelectTrigger>
            <SelectContent>{['openai', 'google', 'azure', 'anthropic', 'bedrock', 'glm', 'azimara-runtime'].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button size="sm" className="radius-button mt-4" onClick={simulate} disabled={busy}>{busy ? 'Evaluating…' : 'Run simulation'}</Button>
      </div>

      {result && (
        <div className={`rounded-lg border p-3 ${decision === 'deny' ? 'border-[#F06B7A]/40 bg-[#F06B7A]/8' : decision === 'require_approval' ? 'border-[#F2B95D]/40 bg-[#F2B95D]/8' : 'border-[#35C991]/40 bg-[#35C991]/8'}`} data-testid="policy-verdict">
          <div className="flex items-center gap-2">
            {decision === 'deny' ? <ShieldX className="h-4 w-4 text-[#F06B7A]" /> : decision === 'require_approval' ? <UserCheck className="h-4 w-4 text-[#F2B95D]" /> : <ShieldCheck className="h-4 w-4 text-[#35C991]" />}
            <p className="text-body-sm font-semibold">{String(decision).replace('_', ' ')}</p>
            <span className="text-micro text-muted-foreground">{String(result.evaluatedCount)} policies evaluated</span>
          </div>
          <p className="text-caption mt-1.5">{String(result.reason)}</p>
          {(result.matched as { policyName: string; effect: string; why: string }[] | undefined ?? []).length > 0 && (
            <div className="mt-2 space-y-1">
              {((result.matched ?? []) as { policyName: string; effect: string; why: string }[]).map((m, i) => (
                <KV key={i} k={m.policyName} v={<span className="font-mono text-caption">{m.why}</span>} mono />
              ))}
            </div>
          )}
        </div>
      )}
    </Section>
  )
}

function CreatePolicyDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [effect, setEffect] = useState('deny')
  const [kind, setKind] = useState('guardrail')
  const [rulesText, setRulesText] = useState('[{"field":"tool.riskClass","operator":"eq","value":"critical"}]')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    setSaving(true)
    setError(null)
    try {
      const rules = JSON.parse(rulesText)
      await api('/api/policies', { method: 'POST', body: { op: 'create', name, effect, kind, rules, priority: 500 } })
      onOpenChange(false)
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid rules JSON or create failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="radius-modal">
        <DialogHeader><DialogTitle>New policy</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label className="text-caption">Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="radius-control bg-panel" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-caption">Effect</Label>
              <Select value={effect} onValueChange={setEffect}>
                <SelectTrigger className="radius-control bg-panel text-caption"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="deny">deny</SelectItem>
                  <SelectItem value="require_approval">require_approval</SelectItem>
                  <SelectItem value="allow">allow</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-caption">Kind</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger className="radius-control bg-panel text-caption"><SelectValue /></SelectTrigger>
                <SelectContent>{['guardrail', 'approval', 'budget', 'model', 'data', 'environment'].map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-caption">Rules (deterministic JSON conditions)</Label>
            <textarea value={rulesText} onChange={(e) => setRulesText(e.target.value)} rows={4} className="w-full rounded-lg border border-input bg-[#0D1424] px-3 py-2 font-mono text-caption" />
          </div>
          {error && <ErrorNote message={error} />}
          <p className="text-micro text-muted-foreground">Deny wins over approval, approval wins over allow. Evaluation happens on every consequential invocation, not just at agent start.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" className="radius-button" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="radius-button" disabled={!name.trim() || saving} onClick={create}>{saving ? 'Creating…' : 'Create policy'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
