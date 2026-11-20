'use client'

import { api, useApi, fmtDate, timeAgo } from '@/lib/client'
import { PageHeader, Section, DataTable, StatusChip, ErrorNote, LoadingBlock } from '@/components/mesh/kit'
import { useAppStore } from '@/lib/client'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Pause, Play, Trash2 } from 'lucide-react'

export function SchedulesView() {
  const navigate = useAppStore((s) => s.navigate)
  const bumpRefresh = useAppStore((s) => s.bumpRefresh)
  const { data, error, loading, reload } = useApi<{ schedules: Record<string, unknown>[] }>('/api/schedules')

  const toggle = async (id: string) => {
    try { await api('/api/schedules', { method: 'POST', body: { op: 'toggle', id } }); reload(); bumpRefresh() } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed') }
  }
  const remove = async (id: string) => {
    try { await api('/api/schedules', { method: 'POST', body: { op: 'delete', id } }); reload(); bumpRefresh() } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed') }
  }

  return (
    <div className="space-y-5" data-testid="schedules-view">
      <PageHeader title="Schedules" subtitle="Cron-driven triggers for agents and workflows. Scheduled runs enter the same governed execution pipeline." />
      {error && <ErrorNote message={error} />}
      <Section>
        {loading && !data ? <LoadingBlock /> : (
          <DataTable
            rows={data?.schedules ?? []}
            columns={[
              { key: 'name', label: 'Schedule', render: (s) => (
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-micro text-muted-foreground font-mono">{s.cronExpr} · {s.timezone}</p>
                </div>
              ) },
              { key: 'targetName', label: 'Target', render: (s) => (
                <span className="text-caption">{s.targetName || '—'} <span className="text-micro text-muted-foreground">({s.targetKind})</span></span>
              ) },
              { key: 'status', label: 'Status', render: (s) => <StatusChip status={s.status} size="xs" /> },
              { key: 'lastRunAt', label: 'Last run', render: (s) => timeAgo(s.lastRunAt) },
              { key: 'nextRunAt', label: 'Next run', render: (s) => s.nextRunAt ? fmtDate(s.nextRunAt) : '—' },
              { key: 'actions', label: '', align: 'right', render: (s) => (
                <div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="sm" className="h-7 px-1.5" onClick={() => toggle(String(s.id))}>
                    {s.status === 'active' ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 px-1.5 text-[#F06B7A] hover:text-[#F06B7A]" onClick={() => remove(String(s.id))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) },
            ]}
          />
        )}
      </Section>
      <p className="text-caption text-muted-foreground">Need a new trigger? Schedules are created via <button className="text-[#8B7CFF] underline" onClick={() => navigate('devportal')}>POST /api/schedules</button> or the CLI.</p>
    </div>
  )
}
