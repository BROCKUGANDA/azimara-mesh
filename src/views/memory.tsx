'use client'

import { api, useApi, fmtDate, fmtNum, useAppStore } from '@/lib/client'
import { PageHeader, Section, StatusChip, ErrorNote, LoadingBlock, EmptyState, Json } from '@/components/mesh/kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { useState } from 'react'
import { Search, Trash2, Plus, ShieldCheck } from 'lucide-react'

interface Namespace extends Record<string, unknown> {
  id: string; name: string; slug: string; kind: string; classification: string; retentionDays: number;
  recordCount: number; indexStatus: string; description: string;
  records: { id: string; content: string; classification: string; provenance: string; createdAt: string }[];
}

export function MemoryView() {
  const bumpRefresh = useAppStore((s) => s.bumpRefresh)
  const { data, error, loading, reload } = useApi<{ namespaces: Namespace[]; prompts: { id: string; name: string; slug: string; body: string; version: number }[] }>('/api/memory')
  const [selectedNs, setSelectedNs] = useState<string>('')
  const { data: nsDetail } = useApi<{ namespaces: Namespace[]; prompts: unknown[] }>(selectedNs ? `/api/memory?namespaceId=${selectedNs}` : null)

  const [writeContent, setWriteContent] = useState('')
  const [retrieveQuery, setRetrieveQuery] = useState('')
  const [retrieveResult, setRetrieveResult] = useState<Record<string, unknown> | null>(null)
  const [newNsOpen, setNewNsOpen] = useState(false)

  const ns = nsDetail?.namespaces.find((n) => n.id === selectedNs) ?? data?.namespaces.find((n) => n.id === selectedNs) ?? data?.namespaces[0]

  const write = async () => {
    if (!ns) return
    try {
      await api('/api/memory', { method: 'POST', body: { op: 'write', namespaceId: ns.id, content: writeContent } })
      toast.success('Record written — poisoning detection ran on content')
      setWriteContent('')
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Write rejected')
    }
  }

  const retrieve = async () => {
    if (!ns) return
    try {
      // retrieval test on behalf of Customer Triage (its declared memory scope governs access)
      const agents = await api<{ agents: { id: string; name: string }[] }>('/api/agents?q=customer-triage')
      const agentId = agents.agents[0]?.id
      if (!agentId) { toast.error('No agent available to test retrieval scope'); return }
      const res = await api<Record<string, unknown>>(`/api/memory?agentId=${agentId}`, { method: 'POST', body: { op: 'retrieve', namespaceId: ns.id, query: retrieveQuery } })
      setRetrieveResult(res)
      if (!res.allowed) toast.warning('Retrieval denied — namespace outside agent memory scope')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Retrieval failed')
    }
  }

  const deleteRecord = async (recordId: string) => {
    try {
      await api('/api/memory', { method: 'POST', body: { op: 'delete_record', namespaceId: recordId } })
      toast.success('Record deleted (retention + provenance logged)')
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  const purge = async () => {
    try {
      const res = await api<{ deleted: number }>('/api/memory', { method: 'POST', body: { op: 'purge_expired' } })
      toast.success(`Retention enforced — ${res.deleted} expired records deleted`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  return (
    <div className="space-y-5" data-testid="memory-view">
      <PageHeader
        title="Knowledge & Memory"
        subtitle="Working, episodic, semantic, shared and long-term memory — namespace-scoped, tenant-isolated, authorization-checked on every retrieval."
        actions={
          <>
            <Button variant="outline" className="radius-button" onClick={purge}>Enforce retention</Button>
            <Button className="radius-button" onClick={() => setNewNsOpen(true)}><Plus className="h-4 w-4 mr-1" />New namespace</Button>
          </>
        }
      />
      {error && <ErrorNote message={error} />}

      <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-4">
        <Section title="Namespaces">
          <div className="space-y-1.5">
            {(data?.namespaces ?? []).map((n) => (
              <button
                key={n.id}
                onClick={() => setSelectedNs(n.id)}
                className={`w-full text-left rounded-lg border px-3 py-2 motion-fast ${ns?.id === n.id ? 'border-[#8B7CFF]/50 bg-[#8B7CFF]/8' : 'border-border bg-panel hover:border-[#3D5174]'}`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-caption font-medium truncate">{n.name}</p>
                  <span className="text-micro text-muted-foreground tnum">{fmtNum(n.recordCount)}</span>
                </div>
                <p className="text-micro text-muted-foreground">{n.kind} · {n.classification} · TTL {n.retentionDays}d</p>
              </button>
            ))}
          </div>
          {loading && !data && <LoadingBlock rows={3} />}
        </Section>

        <div className="space-y-4">
          {ns && (
            <>
              <Section title={String(ns.name)} description={`${ns.description} · index ${ns.indexStatus}`}>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <StatusChip status={ns.classification === 'restricted' ? 'critical' : ns.classification === 'confidential' ? 'warning' : 'succeeded'} size="xs" />
                  <span className="text-caption text-muted-foreground">Retention {ns.retentionDays} days · {fmtNum(ns.recordCount)} records</span>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {(ns.records ?? []).map((r) => (
                    <div key={r.id} className="rounded-lg border border-border bg-panel px-3 py-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-caption">{r.content}</p>
                        <p className="text-micro text-muted-foreground mt-1">{r.provenance} · {r.classification} · {fmtDate(r.createdAt)}</p>
                      </div>
                      <button className="text-muted-foreground hover:text-[#F06B7A] shrink-0" onClick={() => deleteRecord(r.id)} aria-label="delete record"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                  {(ns.records ?? []).length === 0 && <EmptyState title="No records in this namespace" />}
                </div>
                <div className="mt-3 flex gap-2">
                  <Input value={writeContent} onChange={(e) => setWriteContent(e.target.value)} placeholder="Write a memory record (poisoning detection active)…" className="radius-control bg-panel" />
                  <Button className="radius-button" disabled={!writeContent.trim()} onClick={write}>Write</Button>
                </div>
              </Section>

              <Section title="Retrieval test (authorization-checked)" description="Runs against Customer Triage's declared memory scope — undeclared namespaces are denied and audited">
                <div className="flex gap-2">
                  <Input value={retrieveQuery} onChange={(e) => setRetrieveQuery(e.target.value)} placeholder="Query, e.g. refund policy" className="radius-control bg-panel" />
                  <Button variant="outline" className="radius-button" onClick={retrieve}><Search className="h-3.5 w-3.5 mr-1" />Retrieve</Button>
                </div>
                {retrieveResult && (
                  <div className="mt-3 space-y-2">
                    <p className={`text-caption flex items-center gap-1.5 ${retrieveResult.allowed ? 'text-[#35C991]' : 'text-[#F06B7A]'}`}>
                      <ShieldCheck className="h-3.5 w-3.5" /> {String(retrieveResult.reason)}
                    </p>
                    <Json data={retrieveResult.records} />
                  </div>
                )}
              </Section>
            </>
          )}

          <Section title="Prompt registry">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(data?.prompts ?? []).map((p) => (
                <div key={p.id} className="rounded-lg border border-border bg-panel p-3">
                  <p className="text-caption font-medium">{p.name} <span className="text-micro text-muted-foreground">v{p.version}</span></p>
                  <p className="text-micro text-muted-foreground mt-1 font-mono">{p.body.slice(0, 100)}…</p>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>

      <NewNamespaceDialog open={newNsOpen} onOpenChange={setNewNsOpen} onCreated={() => { reload(); bumpRefresh() }} />
    </div>
  )
}

function NewNamespaceDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState('semantic')
  const [classification, setClassification] = useState('internal')
  const [saving, setSaving] = useState(false)

  const create = async () => {
    setSaving(true)
    try {
      await api('/api/memory', { method: 'POST', body: { op: 'create_namespace', name, kind, classification } })
      onOpenChange(false)
      onCreated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="radius-modal">
        <DialogHeader><DialogTitle>New memory namespace</DialogTitle></DialogHeader>
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
                <SelectContent>{['working', 'episodic', 'semantic', 'shared', 'longterm'].map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-caption">Classification</Label>
              <Select value={classification} onValueChange={setClassification}>
                <SelectTrigger className="radius-control bg-panel text-caption"><SelectValue /></SelectTrigger>
                <SelectContent>{['public', 'internal', 'confidential', 'restricted'].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-micro text-muted-foreground">Restricted namespaces are never accessible unless explicitly declared in an agent&apos;s memory configuration.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" className="radius-button" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="radius-button" disabled={!name.trim() || saving} onClick={create}>{saving ? 'Creating…' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
