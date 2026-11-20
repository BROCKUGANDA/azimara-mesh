'use client'

import { useState } from 'react'
import { useApi, fmtDate } from '@/lib/client'
import { PageHeader, Section, DataTable, StatusChip, ErrorNote, LoadingBlock, Json } from '@/components/mesh/kit'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function AuditView() {
  const [action, setAction] = useState('')
  const [severity, setSeverity] = useState('all')
  const { data, error, loading } = useApi<{ events: Record<string, unknown>[]; total: number }>(
    `/api/audit?take=80${action ? `&action=${action}` : ''}${severity !== 'all' ? `&severity=${severity}` : ''}`,
  )
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null)

  return (
    <div className="space-y-5" data-testid="audit-view">
      <PageHeader
        title="Audit Center"
        subtitle="Immutable audit evidence for every consequential operation — governance actions, executions, identity changes, billing events."
        badge={<span className="text-micro text-muted-foreground">{data?.total ?? 0} recent events</span>}
      />
      {error && <ErrorNote message={error} />}

      <Section>
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <Input placeholder="Filter by action (e.g. agent., policy., approval.)" value={action} onChange={(e) => setAction(e.target.value)} className="h-9 max-w-xs radius-control bg-panel" />
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger className="h-9 w-40 radius-control bg-panel text-caption"><SelectValue placeholder="Severity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              {['info', 'notice', 'warning', 'critical'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {loading && !data ? <LoadingBlock /> : (
          <DataTable
            rows={data?.events ?? []}
            onRowClick={(e) => setSelected(e)}
            columns={[
              { key: 'severity', label: '', render: (e) => <StatusChip status={e.severity === 'critical' ? 'critical' : e.severity === 'warning' ? 'warning' : e.severity === 'notice' ? 'pending' : 'succeeded'} size="xs" /> },
              { key: 'action', label: 'Action', render: (e) => <span className="font-mono text-caption">{e.action}</span> },
              { key: 'actorName', label: 'Actor', render: (e) => (
                <div><p className="text-caption">{e.actorName || e.actorType}</p><p className="text-micro text-muted-foreground">{e.actorType}</p></div>
              ) },
              { key: 'resourceType', label: 'Resource', render: (e) => <span className="text-caption">{e.resourceType}{e.resourceId ? ` …${String(e.resourceId).slice(-6)}` : ''}</span> },
              { key: 'createdAt', label: 'Timestamp', render: (e) => fmtDate(e.createdAt) },
            ]}
          />
        )}
      </Section>

      {selected && (
        <Section title={`Event detail · ${String(selected.action)}`}>
          <Json data={selected.detail} />
        </Section>
      )}
    </div>
  )
}
