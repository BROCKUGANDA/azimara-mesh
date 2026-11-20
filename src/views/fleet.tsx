'use client'

import { useMemo, useState } from 'react'
import { api, useApi, fmtUsd, fmtMs, timeAgo } from '@/lib/client'
import { PageHeader, Section, DataTable, StatusChip, HealthDot, AutonomyBadge, ErrorNote, LoadingBlock, EmptyState } from '@/components/mesh/kit'
import { useAppStore } from '@/lib/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Plus, LayoutGrid, List } from 'lucide-react'
import type { ViewId } from '@/lib/types'

interface AgentRow extends Record<string, unknown> {
  id: string; name: string; slug: string; description: string; status: string; healthStatus: string;
  autonomyLevel: string; category: string; framework: string; currentVersion: string;
  fleet: string | null; ownerName: string; successRate: number; avgLatencyMs: number;
  spendMonth: number; lastActiveAt: string | null; toolCount: number; activeRuns: number;
}
interface FleetRow extends Record<string, unknown> {
  id: string; name: string; status: string; agentsCount: number; healthyAgents: number; avgSuccessRate: number; spend: number; monthlyBudget: number;
}

export function FleetView() {
  const navigate = useAppStore((s) => s.navigate)
  const refreshKey = useAppStore((s) => s.refreshKey)
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [mode, setMode] = useState<'list' | 'graph'>('list')
  const { data, error, loading, reload } = useApi<{ agents: AgentRow[] }>(`/api/agents`, { pollMs: 10000, refreshKey })
  const { data: fleetData } = useApi<{ fleets: FleetRow[] }>('/api/fleets', { refreshKey })
  const [createOpen, setCreateOpen] = useState(false)

  const agents = useMemo(() => (data?.agents ?? []).filter((a) => {
    if (statusFilter !== 'all' && a.status !== statusFilter) return false
    if (q && !`${a.name} ${a.slug} ${a.framework} ${a.fleet ?? ''}`.toLowerCase().includes(q.toLowerCase())) return false
    return true
  }), [data, q, statusFilter])

  return (
    <div className="space-y-5" data-testid="fleet-view">
      <PageHeader
        title="Agent Fleet"
        subtitle="Every registered agent across the workspace — status, versions, live runs, spend and ownership."
        actions={
          <>
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button onClick={() => setMode('list')} className={`px-2.5 py-1.5 text-caption flex items-center gap-1.5 ${mode === 'list' ? 'bg-elevated text-foreground' : 'text-muted-foreground'}`}><List className="h-3.5 w-3.5" />List</button>
              <button onClick={() => setMode('graph')} className={`px-2.5 py-1.5 text-caption flex items-center gap-1.5 ${mode === 'graph' ? 'bg-elevated text-foreground' : 'text-muted-foreground'}`}><LayoutGrid className="h-3.5 w-3.5" />Graph</button>
            </div>
            <Button className="radius-button" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" />Register agent</Button>
          </>
        }
      />
      {error && <ErrorNote message={error} />}

      {/* Fleet summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(fleetData?.fleets ?? []).slice(0, 4).map((f) => (
          <div key={f.id} className="rounded-xl border border-border bg-card p-3.5">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-body-sm font-medium truncate">{f.name}</p>
              <StatusChip status={f.status} size="xs" />
            </div>
            <p className="text-caption text-muted-foreground tnum">{f.healthyAgents}/{f.agentsCount} healthy · success {Math.round(f.avgSuccessRate * 100)}%</p>
            <p className="text-micro text-muted-foreground tnum mt-1">{fmtUsd(f.spend)} of {fmtUsd(f.monthlyBudget)} fleet budget</p>
          </div>
        ))}
      </div>

      <Section>
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <Input placeholder="Search agents, frameworks, fleets…" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 max-w-xs radius-control bg-panel" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-44 radius-control bg-panel text-caption"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {['healthy', 'degraded', 'ready', 'paused', 'draft', 'failed'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-caption text-muted-foreground ml-auto">{agents.length} agents</span>
        </div>

        {loading && !data ? <LoadingBlock /> : mode === 'list' ? (
          <DataTable
            rows={agents}
            onRowClick={(a) => navigate('fleet', { agentId: a.id })}
            columns={[
              { key: 'name', label: 'Agent', render: (a) => (
                <div className="min-w-0">
                  <p className="font-medium flex items-center gap-2"><HealthDot status={a.healthStatus} />{a.name}</p>
                  <p className="text-micro text-muted-foreground font-mono">{a.slug} · {a.framework}</p>
                </div>
              ) },
              { key: 'status', label: 'Status', render: (a) => <StatusChip status={a.status} size="xs" /> },
              { key: 'autonomyLevel', label: 'Autonomy', render: (a) => <AutonomyBadge level={a.autonomyLevel} /> },
              { key: 'fleet', label: 'Fleet', render: (a) => a.fleet ?? <span className="text-muted-foreground">—</span> },
              { key: 'currentVersion', label: 'Version', render: (a) => <span className="font-mono text-caption">v{a.currentVersion}</span> },
              { key: 'activeRuns', label: 'Runs', align: 'right', render: (a) => a.activeRuns > 0 ? <span className="text-[#8B7CFF] font-semibold">{a.activeRuns}</span> : 0 },
              { key: 'successRate', label: 'Success', align: 'right', render: (a) => `${Math.round(a.successRate * 100)}%` },
              { key: 'avgLatencyMs', label: 'Latency', align: 'right', render: (a) => fmtMs(a.avgLatencyMs) },
              { key: 'spendMonth', label: 'Spend', align: 'right', render: (a) => fmtUsd(a.spendMonth) },
              { key: 'lastActiveAt', label: 'Last active', render: (a) => timeAgo(a.lastActiveAt) },
            ]}
          />
        ) : (
          <AgentGraph agents={agents} onSelect={(id) => navigate('fleet', { agentId: id })} />
        )}
      </Section>

      <CreateAgentDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={() => { setCreateOpen(false); reload() }} />
    </div>
  )
}

/** Radial health graph — fleet topology at a glance. */
function AgentGraph({ agents, onSelect }: { agents: AgentRow[]; onSelect: (id: string) => void }) {
  const cx = 300, cy = 220
  const n = Math.max(agents.length, 1)
  return (
    <div className="overflow-x-auto">
      <svg viewBox="0 0 600 440" className="w-full min-w-[560px]" style={{ maxHeight: 460 }}>
        <circle cx={cx} cy={cy} r={150} fill="none" stroke="#1D2B45" strokeDasharray="3 4" />
        <circle cx={cx} cy={cy} r={90} fill="none" stroke="#1D2B45" strokeDasharray="3 4" />
        {agents.slice(0, 14).map((a, i) => {
          const angle = (i / n) * Math.PI * 2 - Math.PI / 2
          const ring = i % 2 === 0 ? 150 : 90
          const x = cx + Math.cos(angle) * ring
          const y = cy + Math.sin(angle) * ring * 0.85
          const color = a.healthStatus === 'healthy' ? '#35C991' : a.healthStatus === 'degraded' ? '#F2B95D' : a.status === 'paused' ? '#8593AA' : '#F06B7A'
          return (
            <g key={a.id} className="cursor-pointer motion-graph" onClick={() => onSelect(a.id)}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke="#2A3A56" strokeWidth={1} />
              <circle cx={x} cy={y} r={9} fill="#111A2E" stroke={color} strokeWidth={2} />
              <circle cx={x} cy={y} r={3.5} fill={color} />
              <text x={x} y={y + 22} textAnchor="middle" fill="#B4C0D4" fontSize={10}>{a.name.length > 18 ? a.name.slice(0, 17) + '…' : a.name}</text>
              <text x={x} y={y - 14} textAnchor="middle" fill="#8593AA" fontSize={9}>{a.autonomyLevel} · v{a.currentVersion}</text>
            </g>
          )
        })}
        {/* central coordination diamond */}
        <g transform={`translate(${cx},${cy})`}>
          <rect x={-14} y={-14} width={28} height={28} transform="rotate(45)" fill="#111A2E" stroke="#8B7CFF" strokeWidth={1.6} />
          <rect x={-7} y={-7} width={14} height={14} transform="rotate(45)" fill="#8B7CFF" opacity={0.85} />
        </g>
      </svg>
    </div>
  )
}

function CreateAgentDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('custom')
  const [framework, setFramework] = useState('azimara-native')
  const [autonomy, setAutonomy] = useState('A1')
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await api<{ agent: { id: string } }>('/api/agents', {
        method: 'POST',
        body: { name, description, category, framework, autonomyLevel: autonomy, systemPrompt: prompt },
      })
      onOpenChange(false)
      setName(''); setDescription(''); setPrompt('')
      onCreated()
      return res
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="radius-modal">
        <DialogHeader>
          <DialogTitle>Register agent</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-caption">Display name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Contract Summarizer" className="radius-control bg-panel" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-caption">Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this agent do?" className="radius-control bg-panel" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label className="text-caption">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="radius-control bg-panel text-caption"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['research', 'coding', 'data_analysis', 'customer_ops', 'workflow', 'knowledge', 'planning', 'monitoring', 'autonomous', 'custom'].map((c) => <SelectItem key={c} value={c}>{c.replace('_', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-caption">Framework</Label>
              <Select value={framework} onValueChange={setFramework}>
                <SelectTrigger className="radius-control bg-panel text-caption"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['azimara-native', 'langgraph', 'crewai', 'openai-agents', 'mcp-client', 'custom'].map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-caption">Autonomy</Label>
              <Select value={autonomy} onValueChange={setAutonomy}>
                <SelectTrigger className="radius-control bg-panel text-caption"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A0">A0 · Observe</SelectItem>
                  <SelectItem value="A1">A1 · Recommend</SelectItem>
                  <SelectItem value="A2">A2 · Human-approved</SelectItem>
                  <SelectItem value="A3">A3 · Bounded</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-caption">System instructions</Label>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder="System prompt for this agent…" className="w-full rounded-lg border border-input bg-panel px-3 py-2 text-body-sm" />
          </div>
          {error && <ErrorNote message={error} />}
          <p className="text-micro text-muted-foreground">New agents start as DRAFT with conservative autonomy and no tool permissions. Configure, publish, then deploy through the pipeline.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" className="radius-button" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="radius-button" disabled={!name.trim() || saving} onClick={submit}>{saving ? 'Creating…' : 'Create draft agent'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
