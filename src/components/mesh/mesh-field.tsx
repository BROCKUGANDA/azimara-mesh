'use client'

// MeshField — a real 3D-projected agent topology rendered on canvas.
// No WebGL dependency: points are rotated in 3D and perspective-projected to 2D,
// then drawn with depth-aware edges and travelling data-flow pulses.

import { useEffect, useRef } from 'react'

interface Point3 { x: number; y: number; z: number }
interface MeshNode extends Point3 { radius: number; tint: number }
interface Edge { a: number; b: number }
interface Ripple { x: number; y: number; started: number }

const PALETTE = ['#8B7CFF', '#42D9E8', '#39C7B2', '#5D8CFF']
const NODE_COUNT = 44
const FOV = 3.4

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildGraph(): { nodes: MeshNode[]; edges: Edge[] } {
  const rand = mulberry32(0x2f6e2b1)
  const nodes: MeshNode[] = [{ x: 0, y: 0, z: 0, radius: 3.2, tint: 0 }]
  for (let i = 1; i < NODE_COUNT; i++) {
    const theta = rand() * Math.PI * 2
    const phi = Math.acos(2 * rand() - 1)
    const r = 0.6 + rand() * 0.75
    nodes.push({
      x: r * Math.sin(phi) * Math.cos(theta),
      y: r * Math.sin(phi) * Math.sin(theta) * 0.72,
      z: r * Math.cos(phi),
      radius: 1.1 + rand() * 1.5,
      tint: Math.floor(rand() * PALETTE.length),
    })
  }
  const edges: Edge[] = []
  const seen = new Set<string>()
  for (let i = 1; i < nodes.length; i++) {
    const nearest = nodes
      .map((n, j) => ({ j, d: j === i ? Infinity : Math.hypot(n.x - nodes[i].x, n.y - nodes[i].y, n.z - nodes[i].z) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 2)
    for (const { j } of nearest) {
      const key = `${Math.min(i, j)}-${Math.max(i, j)}`
      if (!seen.has(key)) { seen.add(key); edges.push({ a: i, b: j }) }
    }
  }
  return { nodes, edges }
}

export function MeshField({
  className = '',
  onActivate,
}: {
  className?: string
  onActivate?: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pointer = useRef({ x: 0, y: 0 })
  const ripples = useRef<Ripple[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const { nodes, edges } = buildGraph()
    let width = 0
    let height = 0
    let frame = 0
    let angle = 0
    let tilt = 0

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = rect.width
      height = rect.height
      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.max(1, Math.floor(height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (reduced) draw(0)
    }

    const project = (p: Point3, cx: number, cy: number, size: number, a: number, b: number) => {
      const x1 = p.x * Math.cos(a) - p.z * Math.sin(a)
      const z1 = p.x * Math.sin(a) + p.z * Math.cos(a)
      const y2 = p.y * Math.cos(b) - z1 * Math.sin(b)
      const z2 = p.y * Math.sin(b) + z1 * Math.cos(b)
      const scale = FOV / (FOV + z2 + 2)
      return { x: cx + x1 * scale * size, y: cy + y2 * scale * size, scale, depth: z2 }
    }

    const draw = (time: number) => {
      ctx.clearRect(0, 0, width, height)
      const cx = width / 2
      const cy = height / 2
      const size = Math.min(width, height) * 0.36
      const a = angle + pointer.current.x * 0.5
      const b = tilt + pointer.current.y * 0.35

      const projected = nodes.map((n) => project(n, cx, cy, size, a, b))

      for (let i = 0; i < edges.length; i++) {
        const { a: from, b: to } = edges[i]
        const p1 = projected[from]
        const p2 = projected[to]
        const depth = (p1.depth + p2.depth) / 2
        const alpha = Math.max(0.08, 0.42 - depth * 0.12)
        ctx.strokeStyle = `rgba(139,124,255,${alpha.toFixed(3)})`
        ctx.lineWidth = 0.8
        ctx.beginPath()
        ctx.moveTo(p1.x, p1.y)
        ctx.lineTo(p2.x, p2.y)
        ctx.stroke()

        if (!reduced) {
          const t = ((time / 2600) + i * 0.137) % 1
          const px = p1.x + (p2.x - p1.x) * t
          const py = p1.y + (p2.y - p1.y) * t
          ctx.fillStyle = `rgba(66,217,232,${(0.35 + 0.5 * (1 - Math.abs(t - 0.5) * 2)).toFixed(3)})`
          ctx.beginPath()
          ctx.arc(px, py, 1.5, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      for (let i = 0; i < nodes.length; i++) {
        const p = projected[i]
        const node = nodes[i]
        const color = PALETTE[node.tint]
        const r = Math.max(0.6, node.radius * p.scale)
        if (i === 0) {
          ctx.save()
          ctx.translate(p.x, p.y)
          ctx.rotate(Math.PI / 4)
          ctx.fillStyle = color
          ctx.shadowColor = color
          ctx.shadowBlur = 22
          ctx.fillRect(-r, -r, r * 2, r * 2)
          ctx.restore()
        } else {
          ctx.fillStyle = color
          ctx.globalAlpha = Math.max(0.35, Math.min(1, 0.9 - p.depth * 0.2))
          ctx.beginPath()
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = 1
        }
      }

      if (!reduced) {
        const now = performance.now()
        ripples.current = ripples.current.filter((rp) => now - rp.started < 900)
        for (const rp of ripples.current) {
          const t = (now - rp.started) / 900
          ctx.strokeStyle = `rgba(66,217,232,${(1 - t) * 0.7})`
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(rp.x, rp.y, 8 + t * 90, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
    }

    const loop = (time: number) => {
      if (!reduced) {
        angle += 0.0016
        tilt += (pointer.current.y * 0.3 - tilt) * 0.04
      }
      draw(time)
      frame = requestAnimationFrame(loop)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()
    frame = requestAnimationFrame(loop)

    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      onPointerMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        pointer.current = {
          x: (e.clientX - rect.left) / rect.width - 0.5,
          y: (e.clientY - rect.top) / rect.height - 0.5,
        }
      }}
      onPointerLeave={() => { pointer.current = { x: 0, y: 0 } }}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        ripples.current.push({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          started: performance.now(),
        })
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(12)
        onActivate?.()
      }}
    />
  )
}
