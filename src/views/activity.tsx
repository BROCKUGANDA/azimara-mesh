'use client'

import { useState } from 'react'
import { api, useApi, timeAgo } from '@/lib/client'
import { PageHeader, Section, DataTable, ErrorNote, LoadingBlock, StatusChip } from '@/components/mesh/kit'
import { useAppStore } from '@/lib/client'
import { Bell, BellOff } from 'lucide-react'
import type { ViewId } from '@/lib/types'

export function ActivityView() {
  const navigate = useAppStore((s) => s.navigate)
  const bumpRefresh = useAppStore((s) => s.bumpRefresh)
  const [filter, setFilter] = useState('')
  const { data, error, loading } = useApi<{ activity: Record<string, unknown>[]; notifications: { id: string; title: string; body: string; severity: string; linkView: string; readAt: string | null; createdAt: string }[] }>('/api/activity?take=60')

  const rows = (data?.activity ?? []).filter((e) => !filter || String(e.action).includes(filter))

  return (
    <div className="space-y-5" data-testid="activity-view">
      <PageHeader title="Activity" subtitle="Operational event stream across the organization — executions, governance actions, identity and billing events." />
      {error && <ErrorNote message={error} />}

      {(data?.notifications ?? []).length > 0 && (
        <Section title="Notifications">
          <div className="space-y-2">
            {(data?.notifications ?? []).map((n) => (
              <div key={String(n.id)} className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 ${n.readAt ? 'border-border bg-panel' : 'border-[#8B7CFF]/30 bg-[#8B7CFF]/8'}`}>
                <div className="min-w-0">
                  <p className="text-body-sm font-medium">{n.title}</p>
                  <p className="text-caption text-muted-foreground">{n.body}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-micro text-muted-foreground">{timeAgo(String(n.createdAt))}</span>
                  {n.linkView && <button className="text-caption text-[#8B7CFF] underline" onClick={() => navigate(n.linkView as ViewId)}>open</button>}
                  {!n.readAt && (
                    <button className="text-muted-foreground hover:text-foreground" onClick={async () => { await api('/api/activity', { method: 'POST', body: { op: 'mark_read', id: n.id } }); bumpRefresh() }} aria-label="mark read">
                      <BellOff className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Event stream">
        {loading && !data ? <LoadingBlock /> : (
          <DataTable
            rows={rows}
            columns={[
              { key: 'severity', label: '', render: (e) => <StatusChip status={e.severity === 'critical' ? 'critical' : e.severity === 'warning' ? 'warning' : e.severity === 'notice' ? 'pending' : 'succeeded'} size="xs" /> },
              { key: 'action', label: 'Action', render: (e) => <span className="font-mono text-caption">{e.action}</span> },
              { key: 'actorName', label: 'Actor', render: (e) => <span className="text-caption">{e.actorName || e.actorType}</span> },
              { key: 'resourceType', label: 'Resource', render: (e) => <span className="text-caption">{e.resourceType}{e.resourceId ? ` …${String(e.resourceId).slice(-6)}` : ''}</span> },
              { key: 'createdAt', label: 'When', render: (e) => timeAgo(e.createdAt) },
            ]}
          />
        )}
      </Section>
    </div>
  )
}
