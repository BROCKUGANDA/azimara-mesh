'use client'

// Catalog (registry across frameworks) + Templates (starter library)

import { useApi, fmtUsd } from '@/lib/client'
import { PageHeader, Section, DataTable, StatusChip, AutonomyBadge, HealthDot, LoadingBlock, ErrorNote, EmptyState } from '@/components/mesh/kit'
import { useAppStore } from '@/lib/client'
import { Badge } from '@/components/ui/badge'

interface AgentRow extends Record<string, unknown> {
  id: string; name: string; slug: string; description: string; status: string; healthStatus: string;
  autonomyLevel: string; category: string; framework: string; currentVersion: string; fleet: string | null; toolCount: number;
}

export function CatalogView() {
  const navigate = useAppStore((s) => s.navigate)
  const { data, error, loading } = useApi<{ agents: AgentRow[] }>('/api/agents')
  const frameworks = [...new Set((data?.agents ?? []).map((a) => a.framework))]

  return (
    <div className="space-y-5" data-testid="catalog-view">
      <PageHeader
        title="Agent Catalog"
        subtitle="The unified registry: every agent regardless of framework or implementation language. Import via REST, SDK, CLI, manifests or MCP-compatible paths — never require a rewrite."
        badge={<Badge variant="outline" className="text-micro text-muted-foreground">{frameworks.length} frameworks</Badge>}
      />
      {error && <ErrorNote message={error} />}

      <div className="flex gap-2 flex-wrap">
        {frameworks.map((f) => <span key={f} className="rounded-full border border-border bg-panel px-3 py-1 text-caption text-muted-foreground">{f} · {(data?.agents ?? []).filter((a) => a.framework === f).length}</span>)}
      </div>

      <Section>
        {loading && !data ? <LoadingBlock /> : (
          <DataTable
            rows={data?.agents ?? []}
            onRowClick={(a) => navigate('fleet', { agentId: a.id })}
            columns={[
              { key: 'name', label: 'Agent', render: (a) => (
                <div className="min-w-0">
                  <p className="font-medium flex items-center gap-2"><HealthDot status={a.healthStatus} />{a.name}</p>
                  <p className="text-micro text-muted-foreground truncate max-w-[280px]">{a.description}</p>
                </div>
              ) },
              { key: 'framework', label: 'Framework' },
              { key: 'category', label: 'Category', render: (a) => <span className="text-caption">{String(a.category).replace('_', ' ')}</span> },
              { key: 'autonomyLevel', label: 'Autonomy', render: (a) => <AutonomyBadge level={a.autonomyLevel} /> },
              { key: 'toolCount', label: 'Tools', align: 'right' },
              { key: 'status', label: 'Status', render: (a) => <StatusChip status={a.status} size="xs" /> },
              { key: 'fleet', label: 'Fleet', render: (a) => a.fleet ?? '—' },
            ]}
          />
        )}
      </Section>

      <Section title="Registration paths">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-caption text-muted-foreground">
          {[
            ['REST APIs', 'POST /api/agents with a manifest payload'],
            ['SDK / CLI', 'TypeScript & Python SDKs; azimara CLI (see Developer Portal)'],
            ['Framework adapters', 'LangGraph, CrewAI, OpenAI Agents SDK, MCP clients register through adapters without rewrites'],
          ].map(([t, d]) => (
            <div key={t} className="rounded-lg border border-border bg-panel p-3">
              <p className="text-body-sm text-foreground font-medium">{t}</p>
              <p className="mt-1">{d}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

const TEMPLATE_DEFS: { name: string; category: string; description: string; autonomy: string; tools: string }[] = [
  { name: 'Support Ticket Triage', category: 'customer_ops', description: 'Classify, escalate and answer inbound tickets; approval checkpoint on escalation paths.', autonomy: 'A2', tools: 'CRM lookup · KB search · Slack' },
  { name: 'Market Research Brief', category: 'research', description: 'Structured web research with citations, confidence levels and a daily digest schedule.', autonomy: 'A1', tools: 'Web search · Memory' },
  { name: 'Spend Watchdog', category: 'data_analysis', description: 'Nightly cost analysis over metered usage with budget-alert notifications.', autonomy: 'A1', tools: 'Analytics SQL · Slack' },
  { name: 'PR Review Gate', category: 'coding', description: 'Static checks + advisories on pull requests; blocks merge on blocker findings.', autonomy: 'A1', tools: 'Repository scan' },
  { name: 'Incident Responder', category: 'workflow', description: 'Severity assessment, bounded runbook execution, approval-gated customer comms.', autonomy: 'A2', tools: 'Metrics · Slack · Email' },
  { name: 'Compliance Observer', category: 'monitoring', description: 'Read-only monitoring of policies and audit trails with periodic reports.', autonomy: 'A0', tools: 'Registry read' },
]

export function TemplatesView() {
  const navigate = useAppStore((s) => s.navigate)
  return (
    <div className="space-y-5" data-testid="templates-view">
      <PageHeader title="Templates" subtitle="Starter agents and workflows — preconfigured with scoped tools, conservative autonomy and evaluation profiles." />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {TEMPLATE_DEFS.map((t) => (
          <button key={t.name} onClick={() => navigate('studio')} className="text-left rounded-xl border border-border bg-card p-4 hover:border-[#8B7CFF]/40 motion-std elev-1">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-body-sm font-semibold">{t.name}</p>
              <AutonomyBadge level={t.autonomy} />
            </div>
            <p className="text-caption text-muted-foreground min-h-[36px]">{t.description}</p>
            <p className="text-micro text-muted-foreground mt-2.5">{t.category.replace('_', ' ')} · {t.tools}</p>
          </button>
        ))}
      </div>
      <Section title="Marketplace" description="Publisher listings ship after the trust model is verified (Phase 6+).">
        <EmptyState title="Marketplace foundations planned" hint="Prebuilt agents, industry workflows and evaluation suites will list publisher, permissions, required credentials and verified evaluation evidence — never broad auto-inherited permissions." />
      </Section>
    </div>
  )
}
