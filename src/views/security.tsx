'use client'

import { api, useApi, fmtDate, timeAgo } from '@/lib/client'
import { PageHeader, Section, DataTable, StatusChip, ErrorNote, LoadingBlock, Json } from '@/components/mesh/kit'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useAppStore } from '@/lib/client'
import { toast } from 'sonner'
import { useState } from 'react'
import { ShieldAlert, ShieldOff, ShieldX, Siren } from 'lucide-react'

const KIND_LABELS: Record<string, string> = {
  prompt_injection: 'Prompt injection', permission_violation: 'Permission violation',
  cost_anomaly: 'Cost anomaly', credential_anomaly: 'Credential anomaly',
  data_exfiltration: 'Data exfiltration', communication_anomaly: 'Communication anomaly',
  repeated_failure: 'Repeated failure',
}

export function SecurityView() {
  const navigate = useAppStore((s) => s.navigate)
  const bumpRefresh = useAppStore((s) => s.bumpRefresh)
  const { data, error, loading, reload } = useApi<{
    incidents: Record<string, unknown>[]
    summary: { open: number; investigating: number; critical: number; high: number; medium: number; low: number; suspendedAgents: string[]; suspendedTools: string[]; denyRate: number }
    recentDenials: Record<string, unknown>[]
  }>('/api/security', { pollMs: 10000 })
  const [investigate, setInvestigate] = useState<Record<string, unknown> | null>(null)
  const [note, setNote] = useState('')
  const [confirmStop, setConfirmStop] = useState(false)

  const updateIncident = async (id: string, status: string) => {
    try {
      await api('/api/security', { method: 'POST', body: { op: 'update_incident', incidentId: id, status, note: note || undefined } })
      toast.success(`Incident ${status}`)
      setInvestigate(null)
      setNote('')
      reload()
      bumpRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  const suspendTool = async (toolId: string) => {
    try {
      await api('/api/security', { method: 'POST', body: { op: 'suspend_tool', toolId, reason: 'Suspended from Security Center' } })
      toast.success('Tool suspended platform-wide')
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  const emergencyStop = async () => {
    try {
      await api('/api/security', { method: 'POST', body: { op: 'emergency_stop', reason: 'Workspace emergency stop from Security Center' } })
      toast.success('Emergency stop applied — agents paused, executions cancelled')
      setConfirmStop(false)
      reload()
      bumpRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  const s = data?.summary

  return (
    <div className="space-y-5" data-testid="security-view">
      <PageHeader
        title="Security Center"
        subtitle="Anomaly detection across agent behavior, permissions, credentials, memory and spend — with emergency controls that keep working while agents are paused."
        badge={<span className="text-micro text-[#F06B7A]">critical systems</span>}
      />
      {error && <ErrorNote message={error} />}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { l: 'Open incidents', v: s?.open ?? '—', c: 'danger' },
          { l: 'Investigating', v: s?.investigating ?? '—', c: 'warning' },
          { l: 'Critical', v: s?.critical ?? '—', c: 'danger' },
          { l: 'Suspended tools', v: s?.suspendedTools.length ?? 0, c: 'violet' },
          { l: 'Recent denials', v: s?.denyRate ?? 0, c: 'cyan' },
        ].map((m) => (
          <div key={m.l} className="rounded-xl border border-border bg-card p-3.5">
            <p className="text-micro text-muted-foreground">{m.l}</p>
            <p className={`text-h3 tnum mt-1 ${m.c === 'danger' ? 'text-[#F06B7A]' : m.c === 'warning' ? 'text-[#F2B95D]' : m.c === 'violet' ? 'text-[#8B7CFF]' : 'text-[#42D9E8]'}`}>{m.v}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" className="radius-button text-[#F06B7A] hover:text-[#F06B7A] hover:border-[#F06B7A]/40" onClick={() => setConfirmStop(true)}>
          <Siren className="h-4 w-4 mr-1.5" />Workspace emergency stop
        </Button>
        {(s?.suspendedAgents ?? []).length > 0 && <span className="text-caption text-muted-foreground">Suspended agents: {(s?.suspendedAgents ?? []).join(', ')}</span>}
        {(s?.suspendedTools ?? []).length > 0 && <span className="text-caption text-muted-foreground">Suspended tools: {(s?.suspendedTools ?? []).join(', ')}</span>}
      </div>

      <Section title="Security incidents" description="Classified findings with investigation history">
        {loading && !data ? <LoadingBlock /> : (
          <DataTable
            rows={data?.incidents ?? []}
            onRowClick={(i) => setInvestigate(i)}
            columns={[
              { key: 'severity', label: 'Severity', render: (i) => <StatusChip status={i.severity} size="xs" /> },
              { key: 'kind', label: 'Kind', render: (i) => <span className="text-caption">{KIND_LABELS[String(i.kind)] ?? i.kind}</span> },
              { key: 'title', label: 'Finding', className: 'max-w-[360px] truncate' },
              { key: 'status', label: 'Status', render: (i) => <StatusChip status={i.status} size="xs" /> },
              { key: 'openedAt', label: 'Opened', render: (i) => timeAgo(i.openedAt) },
            ]}
          />
        )}
      </Section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Section title="Recent permission denials">
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {(data?.recentDenials ?? []).map((d) => (
              <div key={String(d.id)} className="rounded-lg border border-[#F06B7A]/25 bg-[#F06B7A]/6 p-2.5">
                <p className="text-caption font-medium">{String(d.policyName)}</p>
                <p className="text-micro text-muted-foreground mt-0.5">{String(d.reason)}</p>
                <p className="text-micro text-muted-foreground/70 mt-1">{timeAgo(String(d.createdAt))}</p>
              </div>
            ))}
          </div>
        </Section>
        <Section title="Monitoring coverage">
          <div className="grid grid-cols-2 gap-2 text-caption">
            {['Unusual agent behavior', 'Unexpected tool calls', 'Permission violations', 'Prompt injection indicators', 'Data exfiltration indicators', 'Suspicious memory activity', 'Unusual model usage', 'Credential anomalies', 'Excessive execution costs', 'Communication anomalies'].map((c) => (
              <span key={c} className="flex items-center gap-1.5 text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-[#35C991]" />{c}</span>
            ))}
          </div>
        </Section>
      </div>

      {/* Investigation dialog */}
      <Dialog open={!!investigate} onOpenChange={(v) => { if (!v) { setInvestigate(null); setNote('') } }}>
        <DialogContent className="radius-modal">
          <DialogHeader><DialogTitle>{investigate ? String(investigate.title) : ''}</DialogTitle></DialogHeader>
          {investigate && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <StatusChip status={String(investigate.severity)} size="xs" />
                <StatusChip status={String(investigate.status)} size="xs" />
                <span className="text-micro text-muted-foreground">{KIND_LABELS[String(investigate.kind)]}</span>
              </div>
              <Json data={investigate.detail} />
              {investigate.executionId ? (
                <Button variant="outline" size="sm" className="radius-button" onClick={() => navigate('executions', { executionId: String(investigate.executionId) })}>Open execution trace</Button>
              ) : null}
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Investigation note…" rows={2} className="bg-panel text-caption" />
            </div>
          )}
          <DialogFooter className="flex-wrap gap-2">
            {investigate?.status !== 'resolved' && (
              <>
                <Button variant="outline" className="radius-button" onClick={() => updateIncident(String(investigate?.id), 'investigating')}>Start investigating</Button>
                <Button variant="outline" className="radius-button" onClick={() => updateIncident(String(investigate?.id), 'contained')}>Contain</Button>
                <Button className="radius-button" onClick={() => updateIncident(String(investigate?.id), 'resolved')}>Resolve</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Emergency stop confirm */}
      <Dialog open={confirmStop} onOpenChange={setConfirmStop}>
        <DialogContent className="radius-modal">
          <DialogHeader><DialogTitle className="text-[#F06B7A]">Confirm workspace emergency stop</DialogTitle></DialogHeader>
          <p className="text-caption text-muted-foreground">This pauses <span className="text-foreground">all agents</span>, cancels all active and queued executions (including waiting approvals), and suspends production deployments. Security monitoring continues. Requires admin role.</p>
          <DialogFooter>
            <Button variant="outline" className="radius-button" onClick={() => setConfirmStop(false)}>Cancel</Button>
            <Button className="radius-button bg-[#F06B7A] hover:bg-[#F06B7A]/90 text-[#0B1020]" onClick={emergencyStop}><ShieldX className="h-4 w-4 mr-1" />Stop everything</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
