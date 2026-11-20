'use client'

// Visual Agent Studio canvas — drag nodes, connect edges, inspect config,
// synchronized code-first spec view. The versioned workflow spec is the durable
// source of truth; the diagram is a projection of it (per directive §12).

import { useCallback, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { StatusChip, RiskBadge, ErrorNote } from '@/components/mesh/kit'
import { AlertTriangle, Braces, GripVertical, MousePointer2, Trash2, Workflow } from 'lucide-react'
import type { WorkflowNode, WorkflowSpec, WorkflowNodeType } from '@/lib/types'

const NODE_META: Record<WorkflowNodeType, { label: string; color: string; icon: string }> = {
  input: { label: 'Input', color: '#8593AA', icon: '▶' },
  agent: { label: 'Agent', color: '#8B7CFF', icon: '◆' },
  tool: { label: 'Tool', color: '#42D9E8', icon: '⚙' },
  model: { label: 'Model', color: '#5D8CFF', icon: '≋' },
  memory: { label: 'Memory', color: '#39C7B2', icon: '❖' },
  condition: { label: 'Condition', color: '#F2B95D', icon: '⟠' },
  parallel: { label: 'Parallel', color: '#5D8CFF', icon: '⑂' },
  approval: { label: 'Approval', color: '#F2B95D', icon: '✓' },
  delay: { label: 'Delay', color: '#8593AA', icon: '◷' },
  loop: { label: 'Loop', color: '#39C7B2', icon: '↻' },
  output: { label: 'Output', color: '#35C991', icon: '▣' },
  error: { label: 'Error', color: '#F06B7A', icon: '!' },
}

const NODE_W = 168
const NODE_H = 56

export function WorkflowCanvas({ spec, agents, tools, onChange, validation }: {
  spec: WorkflowSpec
  agents: { id: string; name: string }[]
  tools: { id: string; name: string }[]
  onChange: (spec: WorkflowSpec) => void
  validation: { ok: boolean; errors: string[] }
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const [mode, setMode] = useState<'visual' | 'code'>('visual')
  const [codeText, setCodeText] = useState('')
  const dragState = useRef<{ key: string; dx: number; dy: number } | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)

  const node = spec.nodes.find((n) => n.key === selected) ?? null

  const onPointerDown = useCallback((e: React.PointerEvent, key: string) => {
    const n = spec.nodes.find((x) => x.key === key)
    if (!n) return
    dragState.current = { key, dx: e.clientX - (n.x ?? 0), dy: e.clientY - (n.y ?? 0) }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }, [spec.nodes])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current) return
    const { key, dx, dy } = dragState.current
    const x = Math.max(8, e.clientX - dx)
    const y = Math.max(8, e.clientY - dy)
    onChange({
      ...spec,
      nodes: spec.nodes.map((n) => (n.key === key ? { ...n, x, y } : n)),
    })
  }, [spec, onChange])

  const onPointerUp = useCallback(() => { dragState.current = null }, [])

  const updateNode = (key: string, patch: Partial<WorkflowNode>) => {
    onChange({ ...spec, nodes: spec.nodes.map((n) => (n.key === key ? { ...n, ...patch } : n)) })
  }

  const addNode = (type: WorkflowNodeType) => {
    const idx = spec.nodes.length + 1
    const key = `${type}_${idx}`
    const meta = NODE_META[type]
    onChange({
      ...spec,
      nodes: [...spec.nodes, { key, type, label: `${meta.label} ${idx}`, config: {}, x: 80 + (idx % 4) * 190, y: 60 + Math.floor(idx / 4) * 100 }],
    })
    setSelected(key)
  }

  const deleteNode = (key: string) => {
    onChange({
      ...spec,
      nodes: spec.nodes.filter((n) => n.key !== key),
      edges: spec.edges.filter((e) => e.from !== key && e.to !== key),
    })
    setSelected(null)
  }

  const connect = (from: string, to: string) => {
    if (from === to) return
    if (spec.edges.some((e) => e.from === from && e.to === to)) return
    onChange({ ...spec, edges: [...spec.edges, { from, to }] })
  }

  const applyCode = () => {
    try {
      const parsed = JSON.parse(codeText) as WorkflowSpec
      onChange(parsed)
      setMode('visual')
    } catch {
      // keep visual mode; the parent surfaces validation errors
    }
  }

  const pos = (n: WorkflowNode) => ({ x: n.x ?? 60, y: n.y ?? 60 })

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Tabs value={mode} onValueChange={(v) => {
          if (v === 'code') setCodeText(JSON.stringify(spec, null, 2))
          setMode(v as 'visual' | 'code')
        }}>
          <TabsList className="bg-panel">
            <TabsTrigger value="visual" className="text-caption gap-1.5"><Workflow className="h-3.5 w-3.5" />Visual</TabsTrigger>
            <TabsTrigger value="code" className="text-caption gap-1.5"><Braces className="h-3.5 w-3.5" />Code-first</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-1.5 flex-wrap">
          {(Object.keys(NODE_META) as WorkflowNodeType[]).map((t) => (
            <Button key={t} variant="outline" size="sm" className="h-7 text-micro px-2 radius-button" onClick={() => addNode(t)}>
              <span style={{ color: NODE_META[t].color }}>{NODE_META[t].icon.trim()}</span>
              <span className="ml-1">{NODE_META[t].label}</span>
            </Button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {validation.ok
            ? <StatusChip status="published" size="xs" />
            : <span className="inline-flex items-center gap-1 text-caption text-[#F2B95D]"><AlertTriangle className="h-3.5 w-3.5" />{validation.errors.length} validation issue{validation.errors.length > 1 ? 's' : ''}</span>}
        </div>
      </div>

      {mode === 'code' ? (
        <div className="space-y-2">
          <Textarea
            value={codeText}
            onChange={(e) => setCodeText(e.target.value)}
            className="font-mono text-caption bg-[#0D1424] border-border min-h-[360px]"
            spellCheck={false}
          />
          <div className="flex gap-2">
            <Button size="sm" className="radius-button" onClick={applyCode}>Apply spec</Button>
            <p className="text-caption text-muted-foreground self-center">The versioned spec — not the diagram — is the durable source of truth.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-3">
          <div
            ref={canvasRef}
            className="grid-surface relative rounded-xl border border-border bg-[#0D1424] overflow-auto"
            style={{ height: 480 }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <svg className="absolute inset-0 h-full w-full pointer-events-none" data-testid="workflow-edges">
              {spec.edges.map((e, i) => {
                const a = spec.nodes.find((n) => n.key === e.from)
                const b = spec.nodes.find((n) => n.key === e.to)
                if (!a || !b) return null
                const pa = pos(a), pb = pos(b)
                const x1 = pa.x + NODE_W, y1 = pa.y + NODE_H / 2
                const x2 = pb.x, y2 = pb.y + NODE_H / 2
                const mx = (x1 + x2) / 2
                return (
                  <g key={i}>
                    <path d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`} fill="none" strokeWidth={1.6} className="opacity-80" style={{ stroke: e.label === 'true' ? '#35C991' : e.label === 'false' ? '#F06B7A' : '#3D5174' }} />
                    {e.label && <text x={mx} y={(y1 + y2) / 2 - 6} fill="#8593AA" fontSize={10} textAnchor="middle">{e.label}</text>}
                    <circle cx={x2} cy={y2} r={3} fill="#5D8CFF" />
                  </g>
                )
              })}
              {connectFrom && (() => {
                const a = spec.nodes.find((n) => n.key === connectFrom)
                if (!a) return null
                const pa = pos(a)
                return <line x1={pa.x + NODE_W} y1={pa.y + NODE_H / 2} x2={pa.x + NODE_W + 60} y2={pa.y + NODE_H / 2} stroke="#8B7CFF" strokeDasharray="4 3" strokeWidth={1.4} />
              })()}
            </svg>

            {spec.nodes.map((n) => {
              const meta = NODE_META[n.type] ?? NODE_META.input
              const p = pos(n)
              const isSelected = selected === n.key
              return (
                <div
                  key={n.key}
                  data-testid={`wf-node-${n.key}`}
                  className={cn(
                    'absolute select-none rounded-xl border bg-panel elev-2 touch-none',
                    isSelected ? 'border-[#8B7CFF] ring-1 ring-[#8B7CFF]/40' : 'border-border hover:border-[#3D5174]',
                  )}
                  style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}
                  onPointerDown={(e) => onPointerDown(e, n.key)}
                >
                  <div className="flex items-center gap-2 h-full px-2.5">
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm shrink-0" style={{ color: meta.color }}>{meta.icon.trim()}</span>
                    <div className="min-w-0">
                      <p className="text-caption font-medium truncate leading-tight">{n.label}</p>
                      <p className="text-micro text-muted-foreground">{meta.label}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    title="Connect from this node"
                    className="absolute -right-2 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border border-[#5D8CFF] bg-[#0D1424] hover:bg-[#5D8CFF]/30 motion-fast"
                    onClick={(e) => { e.stopPropagation(); setConnectFrom(n.key) }}
                  />
                  {connectFrom && connectFrom !== n.key && (
                    <button
                      type="button"
                      title={`Connect ${connectFrom} → ${n.key}`}
                      className="absolute inset-0 rounded-xl ring-2 ring-[#8B7CFF]/50 ring-offset-0"
                      onClick={(e) => { e.stopPropagation(); connect(connectFrom, n.key); setConnectFrom(null) }}
                    />
                  )}
                </div>
              )
            })}

            {connectFrom && (
              <div className="absolute bottom-2 left-2 rounded-md bg-panel border border-border px-2 py-1 text-micro text-muted-foreground">
                Connecting from <span className="text-[#8B7CFF]">{connectFrom}</span> — click a target node
                <button className="ml-2 underline" onClick={() => setConnectFrom(null)}>cancel</button>
              </div>
            )}
            {spec.nodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-caption text-muted-foreground gap-2">
                <MousePointer2 className="h-4 w-4" /> Add nodes above to start the workflow
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-3 space-y-3 max-h-[480px] overflow-y-auto" data-testid="node-inspector">
            {node ? (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-caption font-semibold text-[#8B7CFF]">Inspector</p>
                  <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[#F06B7A] hover:text-[#F06B7A]" onClick={() => deleteNode(node.key)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="space-y-2">
                  <label className="text-micro text-muted-foreground">Label</label>
                  <Input value={node.label} onChange={(e) => updateNode(node.key, { label: e.target.value })} className="h-8 text-body-sm radius-control" />
                  <label className="text-micro text-muted-foreground">Key</label>
                  <Input value={node.key} disabled className="h-8 font-mono text-caption radius-control" />
                  <label className="text-micro text-muted-foreground">On error</label>
                  <Select value={node.config.onError ?? 'fail'} onValueChange={(v) => updateNode(node.key, { config: { ...node.config, onError: v as 'fail' | 'continue' | 'compensate' } })}>
                    <SelectTrigger className="h-8 text-caption radius-control"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fail">fail</SelectItem>
                      <SelectItem value="continue">continue</SelectItem>
                      <SelectItem value="compensate">compensate</SelectItem>
                    </SelectContent>
                  </Select>

                  {node.type === 'agent' && (
                    <>
                      <label className="text-micro text-muted-foreground">Agent</label>
                      <Select value={node.config.agentId ?? ''} onValueChange={(v) => updateNode(node.key, { config: { ...node.config, agentId: v } })}>
                        <SelectTrigger className="h-8 text-caption radius-control"><SelectValue placeholder="select agent" /></SelectTrigger>
                        <SelectContent>
                          {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </>
                  )}
                  {node.type === 'tool' && (
                    <>
                      <label className="text-micro text-muted-foreground">Tool</label>
                      <Select value={node.config.toolId ?? ''} onValueChange={(v) => updateNode(node.key, { config: { ...node.config, toolId: v } })}>
                        <SelectTrigger className="h-8 text-caption radius-control"><SelectValue placeholder="select tool" /></SelectTrigger>
                        <SelectContent>
                          {tools.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </>
                  )}
                  {node.type === 'condition' && (
                    <>
                      <label className="text-micro text-muted-foreground">Expression (path op value)</label>
                      <Input value={node.config.expr ?? ''} onChange={(e) => updateNode(node.key, { config: { ...node.config, expr: e.target.value } })} className="h-8 font-mono text-caption radius-control" placeholder="input.priority == 'high'" />
                      <p className="text-micro text-muted-foreground">Label outgoing edges “true” / “false” in the code view.</p>
                    </>
                  )}
                  {node.type === 'loop' && (
                    <>
                      <label className="text-micro text-muted-foreground">Max iterations (bounded)</label>
                      <Input type="number" min={1} max={5} value={node.config.iterations ?? 2} onChange={(e) => updateNode(node.key, { config: { ...node.config, iterations: Number(e.target.value) } })} className="h-8 radius-control" />
                    </>
                  )}
                  {node.type === 'parallel' && (
                    <>
                      <label className="text-micro text-muted-foreground">Fan-out children (keys)</label>
                      <Input value={(node.config.children ?? []).join(', ')} onChange={(e) => updateNode(node.key, { config: { ...node.config, children: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) } })} className="h-8 font-mono text-caption radius-control" />
                    </>
                  )}
                  {node.type === 'delay' && (
                    <>
                      <label className="text-micro text-muted-foreground">Delay seconds (bounded to 3 in demo)</label>
                      <Input type="number" min={1} max={10} value={node.config.delaySeconds ?? 1} onChange={(e) => updateNode(node.key, { config: { ...node.config, delaySeconds: Number(e.target.value) } })} className="h-8 radius-control" />
                    </>
                  )}
                </div>
                <div className="pt-1">
                  <p className="text-micro text-muted-foreground mb-1">Edges from this node</p>
                  {spec.edges.filter((e) => e.from === node.key).map((e, i) => (
                    <div key={i} className="flex items-center justify-between text-caption py-0.5">
                      <span className="font-mono text-[#42D9E8]">→ {e.to}{e.label ? ` [${e.label}]` : ''}</span>
                      <button className="text-muted-foreground hover:text-[#F06B7A]" onClick={() => onChange({ ...spec, edges: spec.edges.filter((x) => x !== e) })}>×</button>
                    </div>
                  ))}
                  {spec.edges.filter((e) => e.from === node.key).length === 0 && <p className="text-micro text-muted-foreground">none</p>}
                </div>
              </>
            ) : (
              <div className="text-caption text-muted-foreground py-8 text-center">
                Select a node to inspect its configuration.
                {!validation.ok && <div className="mt-3 text-left"><ErrorNote message={validation.errors.join('; ')} /></div>}
              </div>
            )}
          </div>
        </div>
      )}
      {mode === 'visual' && !validation.ok && (
        <ErrorNote message={validation.errors.join(' · ')} />
      )}
    </div>
  )
}
