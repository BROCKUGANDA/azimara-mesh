'use client'

// Public landing experience for AZIMARA MESH.
// Theme: "Governed Intelligence in Motion" — a central core coordinating many
// autonomous nodes. Motion communicates topology, state and data flow rather
// than decorating the page.

import { motion, useReducedMotion } from 'framer-motion'
import {
  Activity, ArrowRight, BadgeCheck, Boxes, Brain, CircuitBoard, Fingerprint,
  FlaskConical, Gauge, GitBranch, LockKeyhole, Network, Radar, ShieldCheck,
  Sparkles, Workflow,
} from 'lucide-react'
import { MeshField } from '@/components/mesh/mesh-field'
import { haptic } from '@/lib/haptics'
import { Button } from '@/components/ui/button'

interface LandingProps {
  onEnterDemo: () => void
  onSignIn: () => void
  demoLoading: boolean
  demoError?: string | null
}

const CAPABILITIES = [
  { icon: Boxes, title: 'Agent Registry', body: 'One source of truth for every agent: identity, owner, version, model, tools and policy.', accent: '#8B7CFF' },
  { icon: GitBranch, title: 'Durable Orchestration', body: 'Sequential and parallel work with checkpoints, approvals, cancellation and recovery.', accent: '#42D9E8' },
  { icon: ShieldCheck, title: 'Trust Plane', body: 'Deterministic policy decisions, scoped identities and audit evidence before every action.', accent: '#39C7B2' },
  { icon: Radar, title: 'Observability', body: 'Correlated traces, cost attribution and an execution explorer that explains every handoff.', accent: '#5D8CFF' },
  { icon: FlaskConical, title: 'Evaluation Lab', body: 'Versioned datasets and deterministic evaluators make releases repeatable and comparable.', accent: '#F2B95D' },
  { icon: Gauge, title: 'Budgets & Autonomy', body: 'Hard limits, reservations and autonomy levels enforced by services, not by prompts.', accent: '#8B7CFF' },
]

const PRINCIPLES = [
  { icon: Fingerprint, title: 'Identity first', body: 'Every agent, worker and tool has a distinct, scoped identity.' },
  { icon: LockKeyhole, title: 'Deny by default', body: 'Protected actions require a valid policy context before they run.' },
  { icon: Activity, title: 'Observable by default', body: 'Every significant handoff emits correlated, redacted telemetry.' },
  { icon: BadgeCheck, title: 'Honest by design', body: 'Simulations are labelled; no fabricated metrics or unsupported claims.' },
]

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
}
const stagger = { visible: { transition: { staggerChildren: 0.09 } } }

export function LandingView({ onEnterDemo, onSignIn, demoLoading, demoError }: LandingProps) {
  const reduced = useReducedMotion()

  const enter = () => { haptic([8, 30, 12]); onEnterDemo() }
  const signin = () => { haptic(8); onSignIn() }

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden">
      {/* ambient background */}
      <div className="pointer-events-none fixed inset-0 grid-surface opacity-30" aria-hidden />
      <div className="pointer-events-none fixed -top-40 -left-40 h-[32rem] w-[32rem] rounded-full bg-[#8B7CFF]/10 blur-[120px]" aria-hidden />
      <div className="pointer-events-none fixed -bottom-40 -right-40 h-[32rem] w-[32rem] rounded-full bg-[#42D9E8]/8 blur-[120px]" aria-hidden />

      {/* header */}
      <motion.header
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-8"
      >
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/azimara-mesh-mark.svg" alt="AZIMARA MESH" className="h-9 w-9 motion-graph" />
          <div className="leading-tight">
            <p className="text-caption font-bold tracking-[0.14em]">AZIMARA <span className="brand-gradient-text">MESH</span></p>
            <p className="text-micro text-muted-foreground">Agent Fleet Operating System</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" className="radius-button text-caption motion-fast hover:scale-[1.03]" onClick={signin}>
            Sign in
          </Button>
          <Button className="radius-button text-caption motion-fast hover:scale-[1.03] elev-3" onClick={enter} disabled={demoLoading}>
            {demoLoading ? 'Opening…' : 'Explore demo'}
            {!demoLoading && <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden />}
          </Button>
        </div>
      </motion.header>

      {/* hero */}
      <section className="relative z-10 mx-auto grid max-w-7xl items-center gap-8 px-5 pb-14 pt-6 md:grid-cols-[1.05fr_0.95fr] md:px-8 md:pt-12">
        <motion.div initial="hidden" animate="visible" variants={stagger} className="relative z-10">
          <motion.div variants={fadeUp} className="mb-5 inline-flex items-center gap-2 rounded-pill border border-[#8B7CFF]/25 bg-[#8B7CFF]/8 px-3 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#35C991] shadow-[0_0_8px_#35C991]" aria-hidden />
            <span className="text-micro font-medium uppercase tracking-[0.18em] text-[#B4C0D4]">Every agent. One governed system.</span>
          </motion.div>

          <motion.h1 variants={fadeUp} className="text-display font-bold leading-[0.98] tracking-[-0.03em]">
            The operating fabric for <span className="brand-gradient-text">autonomous AI</span>
          </motion.h1>

          <motion.p variants={fadeUp} className="mt-5 max-w-xl text-body-lg leading-relaxed text-[#B4C0D4]">
            Register, deploy, coordinate, observe and govern fleets of agents across frameworks and providers —
            with permissions, approvals, budgets and evidence enforced by the platform, not by prompts.
          </motion.p>

          <motion.div variants={fadeUp} className="mt-7 flex flex-wrap items-center gap-3">
            <Button size="lg" className="radius-button font-semibold elev-3 motion-fast hover:scale-[1.03]" onClick={enter} disabled={demoLoading}>
              {demoLoading ? 'Opening the Mesh…' : 'Explore the demo'}
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </Button>
            <Button size="lg" variant="outline" className="radius-button motion-fast hover:scale-[1.03]" onClick={signin}>
              Sign in to your workspace
            </Button>
          </motion.div>
          {demoError && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 text-caption text-[#F06B7A]" role="alert">
              {demoError}
            </motion.p>
          )}

          <motion.div variants={fadeUp} className="mt-9 grid max-w-lg grid-cols-3 gap-4 border-t border-border pt-5">
            {[
              { value: '25', label: 'Operator views' },
              { value: 'A0–A3', label: 'Autonomy levels' },
              { value: '100%', label: 'Server-side policy' },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-h3 font-bold tnum">{s.value}</p>
                <p className="text-micro text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* 3D mesh field */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.15 }}
          className="relative h-[320px] w-full md:h-[520px]"
        >
          <div className="absolute inset-0 rounded-panel border border-border bg-[#0E1526]/70 elev-3" aria-hidden />
          <MeshField className="absolute inset-0 h-full w-full cursor-crosshair" onActivate={() => haptic(10)} />
          <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2">
            <Network className="h-3.5 w-3.5 text-[#42D9E8]" aria-hidden />
            <span className="text-micro font-mono uppercase tracking-[0.18em] text-[#8593AA]">Governed topology · live projection</span>
          </div>
          <div className="pointer-events-none absolute bottom-4 right-4 text-right">
            <p className="text-micro font-mono uppercase tracking-[0.16em] text-[#8593AA]">Core / nodes / edges</p>
            <p className="text-caption text-[#B4C0D4]">Move to orient · tap to pulse</p>
          </div>
        </motion.div>
      </section>

      {/* trust strip */}
      <motion.section
        initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={stagger}
        className="relative z-10 border-y border-border bg-[#0E1526]/60"
      >
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-5 py-6 md:grid-cols-4 md:px-8">
          {PRINCIPLES.map((p) => {
            const Icon = p.icon
            return (
              <motion.div key={p.title} variants={fadeUp} className="flex items-start gap-2.5 motion-fast hover:translate-y-[-2px]">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#39C7B2]" aria-hidden />
                <div>
                  <p className="text-caption font-semibold">{p.title}</p>
                  <p className="text-micro text-muted-foreground">{p.body}</p>
                </div>
              </motion.div>
            )
          })}
        </div>
      </motion.section>

      {/* capabilities */}
      <section className="relative z-10 mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-24">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.25 }} variants={stagger}>
          <motion.p variants={fadeUp} className="text-micro font-semibold uppercase tracking-[0.2em] text-[#8B7CFF]">The operating loop</motion.p>
          <motion.h2 variants={fadeUp} className="mt-2 text-h1 font-bold tracking-tight">From registration to governed production</motion.h2>
          <motion.p variants={fadeUp} className="mt-3 max-w-2xl text-body text-[#B4C0D4]">
            Six connected capabilities, one control plane. No separate governance bolted on after the fact.
          </motion.p>

          <div className="mt-9 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {CAPABILITIES.map((c, i) => {
              const Icon = c.icon
              return (
                <motion.article
                  key={c.title}
                  variants={fadeUp}
                  whileHover={reduced ? undefined : { y: -5, transition: { duration: 0.18 } }}
                  onPointerEnter={() => haptic(5)}
                  className="group relative overflow-hidden rounded-panel border border-border bg-card p-5 motion-fast hover:border-[#8B7CFF]/45"
                >
                  <span className="absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-0 blur-2xl transition-opacity duration-200 group-hover:opacity-25" style={{ background: c.accent }} aria-hidden />
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-sm border" style={{ borderColor: `${c.accent}55`, color: c.accent, background: `${c.accent}12` }}>
                      <Icon className="h-4 w-4" aria-hidden />
                    </div>
                    <h3 className="text-h4 font-semibold">{c.title}</h3>
                  </div>
                  <p className="mt-3 text-caption leading-relaxed text-[#B4C0D4]">{c.body}</p>
                  <p className="mt-4 text-micro font-mono text-muted-foreground">0{i + 1} / 06</p>
                </motion.article>
              )
            })}
          </div>
        </motion.div>
      </section>

      {/* macro flow */}
      <motion.section
        initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.25 }} variants={stagger}
        className="relative z-10 border-y border-border bg-[#0E1526]/60"
      >
        <div className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-20">
          <motion.p variants={fadeUp} className="text-micro font-semibold uppercase tracking-[0.2em] text-[#42D9E8]">How work flows</motion.p>
          <motion.h2 variants={fadeUp} className="mt-2 text-h1 font-bold tracking-tight">Every handoff is visible, checked and attributable</motion.h2>
          <div className="mt-10 grid gap-3 md:grid-cols-5">
            {[
              { n: '01', t: 'Register', d: 'Typed manifest, immutable version', icon: Boxes },
              { n: '02', t: 'Govern', d: 'Policy, approval, budget, autonomy', icon: ShieldCheck },
              { n: '03', t: 'Orchestrate', d: 'Durable steps, fan-out, recovery', icon: Workflow },
              { n: '04', t: 'Observe', d: 'Traces, cost and quality signals', icon: Activity },
              { n: '05', t: 'Improve', d: 'Evaluate, promote or roll back', icon: Sparkles },
            ].map((s, i) => {
              const Icon = s.icon
              return (
                <motion.div key={s.n} variants={fadeUp} className="relative rounded-panel border border-border bg-card p-4">
                  {i < 4 && <span className="absolute -right-3 top-1/2 hidden h-px w-6 bg-[#8B7CFF]/40 md:block" aria-hidden />}
                  <div className="flex items-center justify-between">
                    <span className="text-micro font-mono text-[#8B7CFF]">{s.n}</span>
                    <Icon className="h-4 w-4 text-[#42D9E8]" aria-hidden />
                  </div>
                  <p className="mt-3 text-h4 font-semibold">{s.t}</p>
                  <p className="mt-1.5 text-micro text-[#B4C0D4]">{s.d}</p>
                </motion.div>
              )
            })}
          </div>
          <motion.p variants={fadeUp} className="mt-6 flex items-center gap-2 text-caption text-muted-foreground">
            <CircuitBoard className="h-3.5 w-3.5 text-[#39C7B2]" aria-hidden />
            Policy decisions are deterministic services — a model&apos;s confidence never overrides them.
          </motion.p>
        </div>
      </motion.section>

      {/* CTA */}
      <section className="relative z-10 mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-24">
        <motion.div
          initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={fadeUp}
          className="relative overflow-hidden rounded-panel border border-[#8B7CFF]/30 bg-gradient-to-br from-[#151C36] via-[#111A2E] to-[#0E1B2C] p-8 md:p-12 elev-3"
        >
          <div className="mesh-shimmer pointer-events-none absolute inset-x-0 top-0 h-px" aria-hidden />
          <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-[#42D9E8]/10 blur-[90px]" aria-hidden />
          <div className="relative max-w-2xl">
            <p className="text-micro font-semibold uppercase tracking-[0.2em] text-[#8B7CFF]">Open the Mesh</p>
            <h2 className="mt-2 text-h1 font-bold tracking-tight">See a governed fleet in motion</h2>
            <p className="mt-3 text-body text-[#B4C0D4]">
              Enter the demo workspace to inspect agents, workflows, traces, approvals, evaluations and cost attribution —
              all from real backend data.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button size="lg" className="radius-button font-semibold motion-fast hover:scale-[1.03]" onClick={enter} disabled={demoLoading}>
                {demoLoading ? 'Opening…' : 'Enter demo workspace'}
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
              </Button>
              <Button size="lg" variant="outline" className="radius-button motion-fast hover:scale-[1.03]" onClick={signin}>Sign in</Button>
            </div>
            <p className="mt-5 flex items-center gap-2 text-micro text-muted-foreground">
              <Brain className="h-3.5 w-3.5 text-[#39C7B2]" aria-hidden />
              Demo actions are clearly labelled. No customer data is used.
            </p>
          </div>
        </motion.div>
      </section>

      <footer className="relative z-10 border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-8 text-micro text-muted-foreground md:flex-row md:items-center md:justify-between md:px-8">
          <p>© 2026 AI AZIMARA · AZIMARA MESH</p>
          <p>Every agent. One governed system. · Intelligence in Motion.</p>
        </div>
      </footer>
    </div>
  )
}
