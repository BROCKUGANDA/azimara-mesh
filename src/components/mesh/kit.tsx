'use client'

// AZIMARA MESH shared UI kit (Design System §31 core components)

import { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Inbox } from 'lucide-react'
import { useAppStore } from '@/lib/client'

// ---------- Page header ----------

export function PageHeader({ title, subtitle, actions, badge }: { title: string; subtitle?: string; actions?: ReactNode; badge?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-h2 tracking-tight">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="text-body-sm text-muted-foreground mt-1 max-w-3xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
    </div>
  )
}

// ---------- Section card ----------

export function Section({ title, description, actions, children, className }: { title?: string; description?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cn('radius-card bg-card border-border', className)}>
      {(title || actions) && (
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              {title && <CardTitle className="text-h4">{title}</CardTitle>}
              {description && <p className="text-caption text-muted-foreground mt-0.5">{description}</p>}
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </div>
        </CardHeader>
      )}
      <CardContent className={cn(title ? 'pt-0' : '')}>{children}</CardContent>
    </Card>
  )
}

// ---------- Status chips ----------

const STATUS_STYLES: Record<string, string> = {
  healthy: 'bg-[#35C991]/12 text-[#35C991] border-[#35C991]/30',
  succeeded: 'bg-[#35C991]/12 text-[#35C991] border-[#35C991]/30',
  active: 'bg-[#35C991]/12 text-[#35C991] border-[#35C991]/30',
  connected: 'bg-[#35C991]/12 text-[#35C991] border-[#35C991]/30',
  published: 'bg-[#35C991]/12 text-[#35C991] border-[#35C991]/30',
  approved: 'bg-[#35C991]/12 text-[#35C991] border-[#35C991]/30',
  resolved: 'bg-[#35C991]/12 text-[#35C991] border-[#35C991]/30',
  ready: 'bg-[#8B7CFF]/12 text-[#8B7CFF] border-[#8B7CFF]/30',
  running: 'bg-[#8B7CFF]/15 text-[#8B7CFF] border-[#8B7CFF]/40',
  queued: 'bg-[#5D8CFF]/12 text-[#5D8CFF] border-[#5D8CFF]/30',
  deploying: 'bg-[#5D8CFF]/12 text-[#5D8CFF] border-[#5D8CFF]/30',
  scaling: 'bg-[#5D8CFF]/12 text-[#5D8CFF] border-[#5D8CFF]/30',
  validating: 'bg-[#5D8CFF]/12 text-[#5D8CFF] border-[#5D8CFF]/30',
  testing: 'bg-[#5D8CFF]/12 text-[#5D8CFF] border-[#5D8CFF]/30',
  draft: 'bg-[#8593AA]/12 text-[#8593AA] border-[#8593AA]/30',
  paused: 'bg-[#8593AA]/15 text-[#8593AA] border-[#8593AA]/30',
  archived: 'bg-[#8593AA]/10 text-[#8593AA] border-[#8593AA]/25',
  retired: 'bg-[#8593AA]/10 text-[#8593AA] border-[#8593AA]/25',
  rolling_back: 'bg-[#8593AA]/15 text-[#8593AA] border-[#8593AA]/30',
  disabled: 'bg-[#8593AA]/10 text-[#8593AA] border-[#8593AA]/25',
  degraded: 'bg-[#F2B95D]/15 text-[#F2B95D] border-[#F2B95D]/35',
  warning: 'bg-[#F2B95D]/15 text-[#F2B95D] border-[#F2B95D]/35',
  waiting_approval: 'bg-[#F2B95D]/15 text-[#F2B95D] border-[#F2B95D]/35',
  pending: 'bg-[#F2B95D]/15 text-[#F2B95D] border-[#F2B95D]/35',
  investigating: 'bg-[#F2B95D]/15 text-[#F2B95D] border-[#F2B95D]/35',
  unverified: 'bg-[#F2B95D]/12 text-[#F2B95D] border-[#F2B95D]/30',
  denied: 'bg-[#F06B7A]/15 text-[#F06B7A] border-[#F06B7A]/35',
  failed: 'bg-[#F06B7A]/15 text-[#F06B7A] border-[#F06B7A]/35',
  cancelled: 'bg-[#F06B7A]/10 text-[#F06B7A] border-[#F06B7A]/30',
  rejected: 'bg-[#F06B7A]/10 text-[#F06B7A] border-[#F06B7A]/30',
  timed_out: 'bg-[#F06B7A]/15 text-[#F06B7A] border-[#F06B7A]/35',
  dead_letter: 'bg-[#F06B7A]/15 text-[#F06B7A] border-[#F06B7A]/35',
  critical: 'bg-[#F06B7A]/15 text-[#F06B7A] border-[#F06B7A]/35',
  offline: 'bg-[#F06B7A]/10 text-[#F06B7A] border-[#F06B7A]/30',
  suspended: 'bg-[#F06B7A]/12 text-[#F06B7A] border-[#F06B7A]/30',
  error: 'bg-[#F06B7A]/12 text-[#F06B7A] border-[#F06B7A]/30',
  contained: 'bg-[#39C7B2]/12 text-[#39C7B2] border-[#39C7B2]/30',
  open: 'bg-[#F2B95D]/15 text-[#F2B95D] border-[#F2B95D]/35',
}

export function StatusChip({ status, size = 'sm' }: { status: string; size?: 'sm' | 'xs' }) {
  const style = STATUS_STYLES[status] ?? 'bg-muted text-muted-foreground border-border'
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap',
      size === 'sm' ? 'px-2 py-0.5 text-caption' : 'px-1.5 py-px text-micro',
      style,
    )}>
      <span className={cn('rounded-full h-1.5 w-1.5', style.split(' ')[1]?.replace('text-', 'bg-'), ['running', 'deploying', 'validating'].includes(status) ? 'animate-pulse' : '')} />
      {status.replace(/_/g, ' ')}
    </span>
  )
}

export function RiskBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    low: 'bg-[#35C991]/10 text-[#35C991] border-[#35C991]/25',
    medium: 'bg-[#66A8F8]/10 text-[#66A8F8] border-[#66A8F8]/25',
    high: 'bg-[#F2B95D]/12 text-[#F2B95D] border-[#F2B95D]/30',
    critical: 'bg-[#F06B7A]/14 text-[#F06B7A] border-[#F06B7A]/30',
  }
  return <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-micro font-medium uppercase tracking-wide', map[level] ?? map.low)}>{level}</span>
}

const AUTONOMY_COLORS: Record<string, string> = {
  A0: 'border-[#8593AA]/40 text-[#8593AA]',
  A1: 'border-[#66A8F8]/50 text-[#66A8F8]',
  A2: 'border-[#F2B95D]/50 text-[#F2B95D]',
  A3: 'border-[#8B7CFF]/50 text-[#8B7CFF]',
}
export const AUTONOMY_LABELS: Record<string, string> = { A0: 'Observe', A1: 'Recommend', A2: 'Human-approved', A3: 'Bounded autonomous' }

export function AutonomyBadge({ level }: { level: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('inline-flex rounded-md border px-1.5 py-px text-micro font-bold tnum', AUTONOMY_COLORS[level] ?? AUTONOMY_COLORS.A1)}>{level}</span>
      <span className="text-caption text-muted-foreground">{AUTONOMY_LABELS[level] ?? level}</span>
    </span>
  )
}

export function HealthDot({ status }: { status: string }) {
  const color = status === 'healthy' ? 'bg-[#35C991]' : status === 'degraded' ? 'bg-[#F2B95D]' : status === 'offline' ? 'bg-[#F06B7A]' : 'bg-[#8593AA]'
  return <span className={cn('inline-block h-2 w-2 rounded-full', color)} aria-label={status} />
}

// ---------- Metric card ----------

export function MetricCard({ label, value, sub, accent = 'violet', onClick, loading }: {
  label: string; value: ReactNode; sub?: ReactNode; accent?: 'violet' | 'cyan' | 'teal' | 'blue' | 'success' | 'warning' | 'danger'; onClick?: () => void; loading?: boolean
}) {
  const accents: Record<string, string> = {
    violet: 'text-[#8B7CFF]', cyan: 'text-[#42D9E8]', teal: 'text-[#39C7B2]',
    blue: 'text-[#5D8CFF]', success: 'text-[#35C991]', warning: 'text-[#F2B95D]', danger: 'text-[#F06B7A]',
  }
  const navigate = useAppStore((s) => s.navigate)
  return (
    <button
      type="button"
      onClick={onClick ? () => onClick() : undefined}
      className={cn(
        'text-left rounded-xl border border-border bg-card p-4 elev-1 motion-std transition-colors w-full',
        onClick ? 'cursor-pointer hover:border-[#8B7CFF]/40 hover:bg-elevated' : 'cursor-default',
      )}
    >
      <p className="text-micro text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="h-7 w-16 mt-1.5" />
      ) : (
        <p className={cn('text-h3 tnum mt-1 leading-none', accents[accent])}>{value}</p>
      )}
      {sub && <div className="text-caption text-muted-foreground mt-1.5">{sub}</div>}
    </button>
  )
}

// ---------- Data table ----------

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Column<T> {
  key: string
  label: string
  render?: (row: T & Record<string, any>) => ReactNode
  className?: string
  align?: 'left' | 'right'
}

export function DataTable<T extends Record<string, unknown>>({ columns, rows, onRowClick, emptyLabel = 'No records', keyField = 'id' }: {
  columns: Column<T>[]; rows: T[]; onRowClick?: (row: T & Record<string, any>) => void; emptyLabel?: string; keyField?: string
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-body-sm">
        <thead>
          <tr className="border-b border-border bg-[#101827]">
            {columns.map((c) => (
              <th key={c.key} className={cn('px-3 py-2 text-micro font-medium text-muted-foreground whitespace-nowrap', c.align === 'right' ? 'text-right' : 'text-left', c.className)}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-caption text-muted-foreground">{emptyLabel}</td></tr>
          )}
          {rows.map((row, i) => (
            <tr
              key={String((row as Record<string, any>)[keyField] ?? i)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn('border-b border-border/60 last:border-0 motion-fast hover:bg-elevated/60', onRowClick && 'cursor-pointer')}
            >
              {columns.map((c) => (
                <td key={c.key} className={cn('px-3 py-2.5 align-middle', c.align === 'right' ? 'text-right tnum' : 'text-left', c.className)}>
                  {c.render ? c.render(row) : String((row as Record<string, any>)[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------- Empty state ----------

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
      <div className="rounded-xl border border-border bg-panel p-3 text-muted-foreground mb-3">
        <Inbox className="h-5 w-5" />
      </div>
      <p className="text-body font-medium">{title}</p>
      {hint && <p className="text-caption text-muted-foreground mt-1 max-w-sm">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

// ---------- Key-value ----------

export function KV({ k, v, mono }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/50 last:border-0">
      <span className="text-caption text-muted-foreground shrink-0 pt-0.5">{k}</span>
      <span className={cn('text-body-sm text-right break-all', mono && 'font-mono text-caption')}>{v ?? '—'}</span>
    </div>
  )
}

export function PermissionNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-[#F2B95D]/30 bg-[#F2B95D]/10 px-3 py-2 text-caption text-[#F2B95D]">
      {children}
    </div>
  )
}

export function SeededNote() {
  return (
    <div className="rounded-lg border border-border bg-panel px-3 py-2 text-caption text-muted-foreground">
      Historical telemetry in this workspace is <span className="text-foreground font-medium">seeded demo data</span>. Trigger a live execution to generate real telemetry through the governed runtime.
    </div>
  )
}

export function LoadingBlock({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
    </div>
  )
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-[#F06B7A]/30 bg-[#F06B7A]/10 px-3 py-2 text-caption text-[#F06B7A]">
      {message}
    </div>
  )
}

export function Json({ data }: { data: unknown }) {
  return (
    <pre className="font-mono text-caption bg-[#0D1424] border border-border rounded-lg p-3 overflow-x-auto max-h-64 overflow-y-auto text-[#B4C0D4]">
      {JSON.stringify(data, null, 2)}
    </pre>
  )
}
