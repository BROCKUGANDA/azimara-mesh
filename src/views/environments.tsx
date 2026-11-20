'use client'

import { useApi } from '@/lib/client'
import { PageHeader, Section, StatusChip, ErrorNote, LoadingBlock, KV } from '@/components/mesh/kit'

export function EnvironmentsView() {
  const { data, error, loading } = useApi<{ environments: Record<string, unknown>[]; hierarchy: string[] }>('/api/environments')

  return (
    <div className="space-y-5" data-testid="environments-view">
      <PageHeader title="Environments" subtitle="Independent development, staging and production environments with per-environment approval requirements and isolation." />
      {error && <ErrorNote message={error} />}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(data?.environments ?? []).map((e) => (
          <Section key={String(e.id)} title={String(e.name)}>
            <KV k="Kind" v={String(e.kind)} />
            <KV k="Requires approval" v={e.requiresApproval ? 'yes (promotion gate)' : 'no'} />
            <KV k="Auto-promote" v={e.autoPromote ? 'enabled' : 'disabled'} />
            <div className="mt-3 space-y-1.5">
              {(e.deployments as { status: string; count: number }[]).map((d) => (
                <div key={d.status} className="flex items-center justify-between">
                  <StatusChip status={d.status} size="xs" />
                  <span className="text-caption tnum">{d.count}</span>
                </div>
              ))}
              {(e.deployments as unknown[]).length === 0 && <p className="text-micro text-muted-foreground">No deployments.</p>}
            </div>
          </Section>
        ))}
      </div>

      <Section title="Tenancy hierarchy">
        {loading && !data ? <LoadingBlock rows={2} /> : (
          <>
            <p className="text-caption text-muted-foreground font-mono">{(data?.hierarchy ?? [])[0]}</p>
            <p className="text-caption text-muted-foreground mt-2">Cross-tenant access is denied by default: every API request resolves the caller&apos;s membership for the target workspace, and all queries are tenant-scoped. Environment isolation, resource quotas, secret scopes and retention boundaries follow the workspace boundary.</p>
          </>
        )}
      </Section>
    </div>
  )
}
