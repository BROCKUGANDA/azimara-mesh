'use client'

// Agent Studio — guided creation wizard wiring identity → model → tools → memory →
// budgets → autonomy → policies, with publish flow.

import { useState } from 'react'
import { api, useApi, fmtNum } from '@/lib/client'
import { PageHeader, Section, ErrorNote, LoadingBlock, KV, RiskBadge, StatusChip } from '@/components/mesh/kit'
import { useAppStore } from '@/lib/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { ChevronRight, Rocket, Save } from 'lucide-react'

const STEPS = ['Identity', 'Model', 'Tools', 'Memory', 'Limits & autonomy', 'Review'] as const

export function StudioView() {
  const navigate = useAppStore((s) => s.navigate)
  const { data: modelData } = useApi<{ models: { id: string; name: string; provider: string; status: string }[] }>('/api/models')
  const { data: toolData } = useApi<{ tools: { id: string; name: string; riskClass: string; requiresApproval: boolean }[] }>('/api/tools')
  const { data: memData } = useApi<{ namespaces: { id: string; name: string; kind: string; classification: string }[] }>('/api/memory')

  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('custom')
  const [framework, setFramework] = useState('azimara-native')
  const [prompt, setPrompt] = useState('')
  const [primaryModel, setPrimaryModel] = useState('')
  const [fallbackModel, setFallbackModel] = useState('none')
  const [tools, setTools] = useState<Set<string>>(new Set())
  const [namespaces, setNamespaces] = useState<Set<string>>(new Set())
  const [budget, setBudget] = useState(25)
  const [maxSteps, setMaxSteps] = useState(10)
  const [autonomy, setAutonomy] = useState('A1')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdId, setCreatedId] = useState<string | null>(null)

  const save = async (publish: boolean) => {
    setSaving(true)
    setError(null)
    try {
      let agentId = createdId
      if (!agentId) {
        const res = await api<{ agent: { id: string } }>('/api/agents', {
          method: 'POST',
          body: { name, description, category, framework, autonomyLevel: autonomy, systemPrompt: prompt, primaryModelId: primaryModel || undefined, fallbackModelIds: fallbackModel !== 'none' ? [fallbackModel] : [], toolPermissions: [...tools], memoryNamespaceIds: [...namespaces], monthlyBudget: budget },
        })
        agentId = res.agent.id
        setCreatedId(agentId)
      } else {
        await api(`/api/agents/${agentId}`, {
          method: 'PATCH',
          body: { systemPrompt: prompt, autonomyLevel: autonomy, toolPermissions: [...tools], memoryNamespaces: [...namespaces], modelConfig: { primary: primaryModel || undefined, fallback: fallbackModel !== 'none' ? [fallbackModel] : [], temperature: 0.3 }, resourceLimits: { maxSteps, timeoutMs: 90000, maxCostUsd: 1.5, maxDelegationDepth: 2, monthlyBudget: budget, maxIterations: 3 } },
        })
      }
      if (publish) {
        await api(`/api/agents/${agentId}`, { method: 'POST', body: { action: 'publish', notes: 'Published from Agent Studio' } })
        toast.success('Agent published — ready to deploy')
      } else {
        toast.success('Agent saved as draft')
      }
      navigate('fleet', { agentId })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const canNext = step === 0 ? name.trim().length > 1 : true

  return (
    <div className="space-y-5" data-testid="studio-view">
      <PageHeader title="Agent Studio" subtitle="Create a governed agent: identity, model routing, scoped tools, authorized memory, bounded resources. New agents default to conservative autonomy." />

      {/* Stepper */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {STEPS.map((s, i) => (
          <button
            key={s}
            onClick={() => setStep(i)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-caption motion-fast ${i === step ? 'border-[#8B7CFF] text-foreground bg-[#8B7CFF]/10' : i < step ? 'border-[#35C991]/40 text-[#35C991]' : 'border-border text-muted-foreground'}`}
          >
            <span className="tnum font-bold">{i + 1}</span> {s}
            {i < STEPS.length - 1 && <ChevronRight className="h-3 w-3 opacity-40" />}
          </button>
        ))}
      </div>

      <Section>
        {step === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
            <div className="space-y-1.5">
              <Label className="text-caption">Display name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Contract Summarizer" className="radius-control bg-panel" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-caption">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="radius-control bg-panel text-caption"><SelectValue /></SelectTrigger>
                <SelectContent>{['research', 'coding', 'data_analysis', 'customer_ops', 'workflow', 'knowledge', 'planning', 'monitoring', 'autonomous', 'custom'].map((c) => <SelectItem key={c} value={c}>{c.replace('_', ' ')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-caption">Framework</Label>
              <Select value={framework} onValueChange={setFramework}>
                <SelectTrigger className="radius-control bg-panel text-caption"><SelectValue /></SelectTrigger>
                <SelectContent>{['azimara-native', 'langgraph', 'crewai', 'openai-agents', 'mcp-client'].map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label className="text-caption">Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this agent does for the organization" className="radius-control bg-panel" />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label className="text-caption">System instructions</Label>
              <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5} placeholder="You are … Never … Always …" className="font-mono text-caption bg-panel" />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
            <div className="space-y-1.5">
              <Label className="text-caption">Primary model</Label>
              <Select value={primaryModel} onValueChange={setPrimaryModel}>
                <SelectTrigger className="radius-control bg-panel text-caption"><SelectValue placeholder="select" /></SelectTrigger>
                <SelectContent>
                  {(modelData?.models ?? []).filter((m) => m.provider === 'Azimara Runtime' || m.provider === 'GLM (z.ai)').map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.provider} · {m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-caption">Fallback model</Label>
              <Select value={fallbackModel} onValueChange={setFallbackModel}>
                <SelectTrigger className="radius-control bg-panel text-caption"><SelectValue placeholder="none" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">none</SelectItem>
                  {(modelData?.models ?? []).map((m) => <SelectItem key={m.id} value={m.id}>{m.provider} · {m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <p className="text-caption text-muted-foreground md:col-span-2">Routing is policy-checked per request: restricted or confidential data is never sent to providers the workspace policy forbids, and failing providers drop to the fallback chain automatically.</p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-2 max-w-2xl">
            {(toolData?.tools ?? []).map((t) => (
              <label key={t.id} className="flex items-center justify-between rounded-lg border border-border bg-panel px-3 py-2 cursor-pointer hover:border-[#8B7CFF]/40 motion-fast">
                <span className="flex items-center gap-2 text-caption">
                  <span className="font-medium">{t.name}</span>
                  <RiskBadge level={t.riskClass} />
                  {t.requiresApproval && <span className="text-micro text-[#F2B95D]">approval-gated</span>}
                </span>
                <Switch checked={tools.has(t.id)} onCheckedChange={(v) => { const n = new Set(tools); if (v) n.add(t.id); else n.delete(t.id); setTools(n) }} />
              </label>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-2 max-w-2xl">
            {(memData?.namespaces ?? []).map((n) => (
              <label key={n.id} className="flex items-center justify-between rounded-lg border border-border bg-panel px-3 py-2 cursor-pointer hover:border-[#8B7CFF]/40 motion-fast">
                <span className="text-caption"><span className="font-medium">{n.name}</span> <span className="text-micro text-muted-foreground">({n.kind} · {n.classification})</span></span>
                <Switch checked={namespaces.has(n.id)} onCheckedChange={(v) => { const s = new Set(namespaces); if (v) s.add(n.id); else s.delete(n.id); setNamespaces(s) }} />
              </label>
            ))}
            <p className="text-caption text-muted-foreground pt-1">Retrieval is checked against the agent's declared scope on every read — undeclared or restricted namespaces are denied and audited.</p>
          </div>
        )}

        {step === 4 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl">
            <div className="space-y-1.5">
              <Label className="text-caption">Monthly budget (USD)</Label>
              <Input type="number" value={budget} onChange={(e) => setBudget(Number(e.target.value))} className="radius-control bg-panel tnum" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-caption">Max steps per run</Label>
              <Input type="number" min={3} max={24} value={maxSteps} onChange={(e) => setMaxSteps(Number(e.target.value))} className="radius-control bg-panel tnum" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-caption">Autonomy</Label>
              <Select value={autonomy} onValueChange={setAutonomy}>
                <SelectTrigger className="radius-control bg-panel text-caption"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A0">A0 · Observe</SelectItem>
                  <SelectItem value="A1">A1 · Recommend</SelectItem>
                  <SelectItem value="A2">A2 · Human-approved</SelectItem>
                  <SelectItem value="A3">A3 · Bounded autonomous</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-caption text-muted-foreground md:col-span-3">Every run also inherits workspace caps: spend checks block launches before any model call, and delegation depth is capped at 2.</p>
          </div>
        )}

        {step === 5 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
            <Section title="Review" description="Confirm the configuration before creating the draft">
              <KV k="Name" v={name || '—'} />
              <KV k="Category / framework" v={`${category} · ${framework}`} />
              <KV k="Autonomy" v={autonomy} />
              <KV k="Primary model" v={primaryModel ? (modelData?.models ?? []).find((m) => m.id === primaryModel)?.name ?? '—' : 'workspace default'} />
              <KV k="Fallback" v={fallbackModel !== 'none' ? (modelData?.models ?? []).find((m) => m.id === fallbackModel)?.name ?? '—' : 'none'} />
              <KV k="Tools" v={fmtNum(tools.size)} />
              <KV k="Memory namespaces" v={fmtNum(namespaces.size)} />
              <KV k="Budget" v={`$${budget} · ${maxSteps} max steps`} />
            </Section>
            <Section title="What happens next">
              <ol className="text-caption text-muted-foreground space-y-2 list-decimal pl-4">
                <li>The agent is created as <span className="text-foreground">DRAFT</span> with a workload identity.</li>
                <li>Publish pins an immutable version snapshot (prompt, tools, autonomy, limits).</li>
                <li>Deploy through the pipeline: validation → evaluation gate → sandbox → canary → production.</li>
                <li>Every execution is traced, policy-checked and metered from the first run.</li>
              </ol>
            </Section>
          </div>
        )}

        {error && <ErrorNote message={error} />}

        <div className="flex items-center justify-between pt-4 border-t border-border mt-2">
          <Button variant="outline" className="radius-button" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>Back</Button>
          <div className="flex gap-2">
            {step < STEPS.length - 1 ? (
              <Button className="radius-button" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Continue <ChevronRight className="h-3.5 w-3.5 ml-1" /></Button>
            ) : (
              <>
                <Button variant="outline" className="radius-button" disabled={saving || !name.trim()} onClick={() => save(false)}><Save className="h-3.5 w-3.5 mr-1" />Save draft</Button>
                <Button className="radius-button" disabled={saving || !name.trim()} onClick={() => save(true)}><Rocket className="h-3.5 w-3.5 mr-1" />Publish agent</Button>
              </>
            )}
          </div>
        </div>
      </Section>
    </div>
  )
}
