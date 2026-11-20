'use client'

import { api, useApi, fmtMs } from '@/lib/client'
import { PageHeader, Section, DataTable, StatusChip, RiskBadge, ErrorNote, LoadingBlock, EmptyState, Json, KV } from '@/components/mesh/kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { useState } from 'react'
import { FlaskConical, Plus, ShieldOff } from 'lucide-react'

interface ToolRow extends Record<string, unknown> {
  id: string; name: string; slug: string; kind: string; version: string; description: string;
  provider: string; authMethod: string; hasSecret: boolean; riskClass: string; dataClass: string;
  rateLimitPerMin: number; timeoutMs: number; requiresApproval: boolean; status: string; ownerName: string;
  callCount: number; errorCount: number; errorRate: number; recentCalls: number; avgLatencyMs: number;
}

export function ToolsView() {
  const { data, error, loading, reload } = useApi<{ tools: ToolRow[] }>('/api/tools')
  const [selected, setSelected] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null)

  const { data: detail } = useApi<{ tool: Record<string, unknown>; recentCalls: Record<string, unknown>[]; grantedAgents: { id: string; name: string; status: string }[] }>(selected ? `/api/tools/${selected}` : null)

  const testTool = async (id: string) => {
    try {
      const res = await api<Record<string, unknown>>(`/api/tools/${id}`, { method: 'POST', body: { action: 'test', input: { query: 'connection health test' } } })
      setTestResult(res)
      if (res.ok) toast.success('Connection test passed (sandboxed adapter)')
      else toast.warning(`Test blocked: ${res.decision ?? 'error'}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test failed')
    }
  }

  const suspend = async (id: string) => {
    try {
      await api(`/api/tools/${id}`, { method: 'POST', body: { action: 'set_status', status: 'suspended' } })
      toast.success('Tool suspended — new invocations are denied by the policy layer')
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  return (
    <div className="space-y-5" data-testid="tools-view">
      <PageHeader
        title="Tool Registry"
        subtitle="Central registry for MCP servers, HTTP APIs, database connectors and internal tools. Every invocation passes schema validation → deterministic policy → adapter → output validation → redaction."
        actions={<Button className="radius-button" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" />Register tool</Button>}
      />
      {error && <ErrorNote message={error} />}

      <Section>
        {loading && !data ? <LoadingBlock /> : (
          <DataTable
            rows={data?.tools ?? []}
            onRowClick={(t) => setSelected(t.id)}
            columns={[
              { key: 'name', label: 'Tool', render: (t) => (
                <div>
                  <p className="font-medium">{t.name} <span className="text-micro text-muted-foreground font-mono">v{t.version}</span></p>
                  <p className="text-micro text-muted-foreground">{t.kind} · {t.provider}</p>
                </div>
              ) },
              { key: 'riskClass', label: 'Risk', render: (t) => <RiskBadge level={t.riskClass} /> },
              { key: 'dataClass', label: 'Data', render: (t) => <span className="text-caption capitalize">{t.dataClass}</span> },
              { key: 'requiresApproval', label: 'Approval', render: (t) => t.requiresApproval ? <span className="text-caption text-[#F2B95D]">required</span> : <span className="text-caption text-muted-foreground">—</span> },
              { key: 'status', label: 'Status', render: (t) => <StatusChip status={t.status} size="xs" /> },
              { key: 'recentCalls', label: 'Calls (30d)', align: 'right' },
              { key: 'errorRate', label: 'Errors', align: 'right', render: (t) => `${Math.round((t.errorRate as number) * 100)}%` },
              { key: 'avgLatencyMs', label: 'Latency', align: 'right', render: (t) => fmtMs(t.avgLatencyMs) },
            ]}
          />
        )}
      </Section>

      {testResult && (
        <Section title="Connection test result" description="Sandboxed adapter execution — external egress is disabled by policy in this deployment">
          <Json data={testResult} />
        </Section>
      )}

      <Dialog open={!!selected} onOpenChange={(v) => { if (!v) { setSelected(null); setTestResult(null) } }}>
        <DialogContent className="radius-modal max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{detail?.tool?.name ? String(detail.tool.name) : 'Tool'}</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-3">
              <p className="text-caption text-muted-foreground">{String(detail.tool.description)}</p>
              <div className="grid grid-cols-2 gap-x-6">
                <KV k="Kind" v={String(detail.tool.kind)} />
                <KV k="Auth" v={String(detail.tool.authMethod)} />
                <KV k="Risk class" v={<RiskBadge level={String(detail.tool.riskClass)} />} />
                <KV k="Data class" v={String(detail.tool.dataClass)} />
                <KV k="Rate limit" v={`${String(detail.tool.rateLimitPerMin)}/min`} />
                <KV k="Timeout" v={fmtMs(Number(detail.tool.timeoutMs))} />
                <KV k="Owner" v={String(detail.tool.ownerName)} />
                <KV k="Secret stored" v={detail.tool.hasSecret ? 'yes (vault ref)' : 'no'} />
              </div>
              <div>
                <p className="text-micro text-muted-foreground mb-1">Input schema</p>
                <Json data={detail.tool.inputSchema} />
              </div>
              <div>
                <p className="text-micro text-muted-foreground mb-1">Granted agents</p>
                <div className="flex flex-wrap gap-1.5">
                  {detail.grantedAgents.map((a) => <span key={a.id} className="rounded-full border border-border bg-panel px-2 py-0.5 text-micro">{a.name}</span>)}
                  {detail.grantedAgents.length === 0 && <span className="text-caption text-muted-foreground">No agents granted access yet.</span>}
                </div>
              </div>
              <div>
                <p className="text-micro text-muted-foreground mb-1">Recent calls</p>
                <DataTable
                  rows={detail.recentCalls}
                  columns={[
                    { key: 'status', label: 'Status', render: (c) => <StatusChip status={c.status === 'succeeded' ? 'succeeded' : c.status === 'failed' ? 'failed' : c.status === 'timeout' ? 'timed_out' : c.status} size="xs" /> },
                    { key: 'latencyMs', label: 'Latency', align: 'right', render: (c) => fmtMs(c.latencyMs) },
                    { key: 'createdAt', label: 'When', render: (c) => new Date(String(c.createdAt)).toLocaleString() },
                  ]}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            {selected && <Button variant="outline" className="radius-button text-[#F06B7A] hover:text-[#F06B7A]" onClick={() => suspend(selected)}><ShieldOff className="h-3.5 w-3.5 mr-1" />Suspend tool</Button>}
            <Button className="radius-button" onClick={() => selected && testTool(selected)}><FlaskConical className="h-3.5 w-3.5 mr-1" />Test connection</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateToolDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={() => reload()} />
    </div>
  )
}

function CreateToolDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState('http')
  const [riskClass, setRiskClass] = useState('medium')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    setSaving(true)
    setError(null)
    try {
      await api('/api/tools', { method: 'POST', body: { name, kind, riskClass, description } })
      onOpenChange(false)
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="radius-modal">
        <DialogHeader><DialogTitle>Register tool</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-caption">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="radius-control bg-panel" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-caption">Kind</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger className="radius-control bg-panel text-caption"><SelectValue /></SelectTrigger>
                <SelectContent>{['http', 'mcp', 'internal', 'database', 'webhook'].map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-caption">Risk class</Label>
              <Select value={riskClass} onValueChange={setRiskClass}>
                <SelectTrigger className="radius-control bg-panel text-caption"><SelectValue /></SelectTrigger>
                <SelectContent>{['low', 'medium', 'high', 'critical'].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-caption">Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} className="radius-control bg-panel" />
          </div>
          {error && <ErrorNote message={error} />}
          <p className="text-micro text-muted-foreground">High and critical risk tools automatically require human approval per the workspace approval-gate policy.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" className="radius-button" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="radius-button" disabled={!name.trim() || saving} onClick={create}>{saving ? 'Creating…' : 'Register'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
