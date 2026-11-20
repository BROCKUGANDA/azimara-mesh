'use client'

import { api, useApi, fmtDate } from '@/lib/client'
import { PageHeader, Section, StatusChip, ErrorNote, LoadingBlock } from '@/components/mesh/kit'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

const CATEGORY_COLORS: Record<string, string> = {
  communication: '#8B7CFF', devops: '#42D9E8', crm: '#39C7B2', data: '#5D8CFF', billing: '#F2B95D',
}

interface IntegrationRow extends Record<string, unknown> {
  id: string; name: string; category: string; status: string; authMethod: string; lastSyncAt: string | null;
}

export function IntegrationsView() {
  const { data, error, loading, reload } = useApi<{ integrations: IntegrationRow[] }>('/api/integrations')

  const act = async (id: string, action: 'connect' | 'disconnect' | 'resync') => {
    try {
      await api('/api/integrations', { method: 'POST', body: { id, action } })
      toast.success(action === 'disconnect' ? 'Integration disconnected' : 'Integration synced')
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  return (
    <div className="space-y-5" data-testid="integrations-view">
      <PageHeader title="Integrations" subtitle="Connected enterprise systems — communication, devops, CRM, data and billing. Tool connectors live in the Tool Registry." />
      {error && <ErrorNote message={error} />}
      {loading && !data ? <LoadingBlock rows={6} /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {(data?.integrations ?? []).map((i) => (
            <div key={i.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: CATEGORY_COLORS[i.category] ?? '#8593AA' }} />
                  <p className="text-body-sm font-semibold">{i.name}</p>
                </div>
                <StatusChip status={i.status === 'connected' ? 'connected' : i.status === 'error' ? 'error' : 'draft'} size="xs" />
              </div>
              <p className="text-micro text-muted-foreground">{i.category} · auth {i.authMethod}</p>
              <p className="text-micro text-muted-foreground mt-1">{i.lastSyncAt ? `last sync ${fmtDate(i.lastSyncAt)}` : 'never synced'}</p>
              <div className="flex gap-2 mt-3">
                {i.status === 'connected' ? (
                  <>
                    <Button size="sm" variant="outline" className="h-7 radius-button text-caption" onClick={() => act(i.id, 'resync')}>Resync</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-[#F06B7A] hover:text-[#F06B7A]" onClick={() => act(i.id, 'disconnect')}>Disconnect</Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" className="h-7 radius-button text-caption" onClick={() => act(i.id, 'connect')}>Connect</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <Section title="MCP compatibility">
        <p className="text-caption text-muted-foreground">Tools and agents register through MCP-compatible integration paths. See the Tool Registry for MCP servers, and the Developer Portal for the full API surface and SDKs.</p>
      </Section>
    </div>
  )
}
