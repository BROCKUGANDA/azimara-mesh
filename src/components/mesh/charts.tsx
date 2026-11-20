'use client'

// Chart wrappers (recharts) + trace waterfall

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { cn } from '@/lib/utils'
import type { TraceSpan } from '@/lib/types'

const AXIS = { stroke: '#8593AA', fontSize: 11 }
const GRID = '#1D2B45'

export function UsageArea({ data, keys, height = 180 }: { data: Record<string, unknown>[]; keys: { key: string; label: string; color: string }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="day" tick={AXIS} tickFormatter={(v: string) => v.slice(5)} />
        <YAxis tick={AXIS} width={44} />
        <Tooltip
          contentStyle={{ background: '#17243A', border: '1px solid #2A3A56', borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: '#B4C0D4' }}
        />
        {keys.map((k) => (
          <Area key={k.key} type="monotone" dataKey={k.key} name={k.label} stroke={k.color} fill={k.color} fillOpacity={0.15} strokeWidth={2} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function TrendLine({ data, keys, height = 180, formatter }: { data: Record<string, unknown>[]; keys: { key: string; label: string; color: string }[]; height?: number; formatter?: (v: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="day" tick={AXIS} tickFormatter={(v: string) => v.slice(5)} />
        <YAxis tick={AXIS} width={44} tickFormatter={formatter} />
        <Tooltip
          contentStyle={{ background: '#17243A', border: '1px solid #2A3A56', borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: '#B4C0D4' }}
        />
        {keys.map((k) => (
          <Line key={k.key} type="monotone" dataKey={k.key} name={k.label} stroke={k.color} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

export function CostBars({ data, height = 200, color = '#8B7CFF', valueKey = 'cost', nameKey = 'name' }: { data: Record<string, unknown>[]; height?: number; color?: string; valueKey?: string; nameKey?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={AXIS} />
        <YAxis type="category" dataKey={nameKey} tick={{ ...AXIS, fontSize: 11 }} width={120} />
        <Tooltip
          cursor={{ fill: '#17243A66' }}
          contentStyle={{ background: '#17243A', border: '1px solid #2A3A56', borderRadius: 8, fontSize: 12 }}
        />
        <Bar dataKey={valueKey} radius={[0, 4, 4, 0]} fill={color} barSize={14} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function Donut({ data, height = 180 }: { data: { name: string; value: number; color: string }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="85%" paddingAngle={2} strokeWidth={0}>
          {data.map((d) => <Cell key={d.name} fill={d.color} />)}
        </Pie>
        <Tooltip
          contentStyle={{ background: '#17243A', border: '1px solid #2A3A56', borderRadius: 8, fontSize: 12 }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

// ---------- Trace waterfall ----------

const KIND_COLORS: Record<string, string> = {
  context_assembly: '#5D8CFF',
  memory_retrieval: '#39C7B2',
  model_request: '#8B7CFF',
  policy_check: '#F2B95D',
  tool_call: '#42D9E8',
  delegation: '#5D8CFF',
  approval_wait: '#F2B95D',
  evaluation: '#35C991',
  output: '#35C991',
  error: '#F06B7A',
  input: '#8593AA',
  agent: '#8B7CFF',
  tool: '#42D9E8',
  condition: '#F2B95D',
  parallel: '#5D8CFF',
  delay: '#8593AA',
  loop: '#39C7B2',
  approval: '#F2B95D',
}

export function TraceWaterfall({ spans, onSelect }: { spans: TraceSpan[]; onSelect?: (span: TraceSpan) => void }) {
  if (spans.length === 0) return <p className="text-caption text-muted-foreground">No trace spans recorded.</p>
  const t0 = Math.min(...spans.map((s) => new Date(s.startedAt).getTime()))
  const t1 = Math.max(...spans.map((s) => (s.endedAt ? new Date(s.endedAt).getTime() : Date.now())))
  const total = Math.max(1, t1 - t0)
  return (
    <div className="space-y-1" data-testid="trace-waterfall">
      {spans.map((s) => {
        const start = new Date(s.startedAt).getTime()
        const end = s.endedAt ? new Date(s.endedAt).getTime() : Math.max(t1, start + 400)
        const left = ((start - t0) / total) * 100
        const width = Math.max(1.2, ((end - start) / total) * 100)
        const color = KIND_COLORS[s.kind] ?? '#8593AA'
        return (
          <button
            key={s.seq}
            type="button"
            onClick={() => onSelect?.(s)}
            className="w-full grid grid-cols-[minmax(140px,220px)_1fr_64px] md:grid-cols-[minmax(180px,260px)_1fr_72px] items-center gap-2 text-left group"
          >
            <span className="text-caption text-muted-foreground truncate group-hover:text-foreground motion-fast">
              <span className="text-micro text-[#8593AA] font-mono mr-1.5">{String(s.seq).padStart(2, '0')}</span>
              {s.label}
            </span>
            <span className="relative h-4 rounded bg-[#101827] overflow-hidden">
              <span
                className={cn('absolute h-full rounded', s.status === 'failed' || s.status === 'denied' ? 'opacity-90' : 'opacity-80')}
                style={{ left: `${left}%`, width: `${width}%`, background: color, minHeight: 6, top: '50%', transform: 'translateY(-50%)' }}
              />
            </span>
            <span className="text-caption tnum text-right text-muted-foreground">
              {s.durationMs >= 1000 ? `${(s.durationMs / 1000).toFixed(1)}s` : `${Math.round(s.durationMs)}ms`}
            </span>
          </button>
        )
      })}
    </div>
  )
}

const STATUS_ORDER: Record<string, number> = { succeeded: 0, running: 1, queued: 2, waiting_approval: 3, failed: 4, timed_out: 4, cancelled: 5, dead_letter: 6 }

export function ExecutionTimeline({ items }: { items: { status: string; startedAt: string; durationMs: number; costUsd: number }[] }) {
  const cells = [...items].reverse().slice(-24)
  return (
    <div className="flex items-end gap-1 h-10 flex-wrap">
      {cells.map((c, i) => {
        const h = Math.max(10, Math.min(100, (c.durationMs / 8000) * 100))
        const failed = (STATUS_ORDER[c.status] ?? 9) >= 4
        const color = c.status === 'succeeded' ? '#35C991' : c.status === 'running' ? '#8B7CFF' : failed ? '#F06B7A' : c.status === 'waiting_approval' ? '#F2B95D' : '#8593AA'
        return (
          <span
            key={i}
            title={`${new Date(c.startedAt).toLocaleString()} — ${c.status} — ${(c.durationMs / 1000).toFixed(1)}s — $${c.costUsd.toFixed(3)}`}
            className="w-1.5 rounded-sm motion-fast hover:opacity-100 opacity-80"
            style={{ height: `${h}%`, background: color, minHeight: 8 }}
          />
        )
      })}
    </div>
  )
}
