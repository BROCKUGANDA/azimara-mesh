'use client'

// AZIMARA MESH application shell — sidebar (§33 navigation), topbar, command palette,
// workspace switcher, environment selector, approvals + notifications.

import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { useAppStore, api, timeAgo } from '@/lib/client'
import type { ViewId } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Activity, ArrowLeftRight, BadgeCheck, Banknote, Bell, Blocks, BookOpen, Boxes, Brain,
  ChevronDown, Command, Compass, FlaskConical, Gauge, Globe, KeyRound, LayoutDashboard,
  ListChecks, LogOut, Menu, Network, PieChart, Plug, Search, Settings, Shield, ShieldAlert,
  Sparkles, Users, Workflow as WorkflowIcon,
} from 'lucide-react'

interface NavItem { id: ViewId; label: string; icon: React.ComponentType<{ className?: string }> }
const NAV_GROUPS: { group: string; items: NavItem[] }[] = [
  { group: 'Operate', items: [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'fleet', label: 'Agent Fleet', icon: Boxes },
    { id: 'workflows', label: 'Workflows', icon: WorkflowIcon },
    { id: 'executions', label: 'Executions', icon: Activity },
    { id: 'schedules', label: 'Schedules', icon: Gauge },
    { id: 'activity', label: 'Activity', icon: Compass },
  ] },
  { group: 'Build', items: [
    { id: 'studio', label: 'Agent Studio', icon: Sparkles },
    { id: 'catalog', label: 'Agent Catalog', icon: Blocks },
    { id: 'templates', label: 'Templates', icon: BookOpen },
    { id: 'models', label: 'Model Hub', icon: Brain },
    { id: 'tools', label: 'Tool Registry', icon: Plug },
    { id: 'memory', label: 'Knowledge & Memory', icon: Network },
  ] },
  { group: 'Trust', items: [
    { id: 'evals', label: 'Evaluation Lab', icon: FlaskConical },
    { id: 'policies', label: 'Policies & Guardrails', icon: Shield },
    { id: 'security', label: 'Security Center', icon: ShieldAlert },
    { id: 'identity', label: 'Identity & Access', icon: KeyRound },
    { id: 'audit', label: 'Audit Center', icon: ListChecks },
  ] },
  { group: 'Manage', items: [
    { id: 'deployments', label: 'Deployments', icon: ArrowLeftRight },
    { id: 'environments', label: 'Environments', icon: Globe },
    { id: 'usage', label: 'Usage & Costs', icon: PieChart },
    { id: 'team', label: 'Team Management', icon: Users },
    { id: 'integrations', label: 'Integrations', icon: Plug },
    { id: 'devportal', label: 'Developer Portal', icon: BookOpen },
    { id: 'billing', label: 'Billing', icon: Banknote },
    { id: 'settings', label: 'Settings', icon: Settings },
  ] },
]

const GROUP_ACCENT: Record<string, string> = {
  Operate: '#42D9E8', Build: '#8B7CFF', Trust: '#F2B95D', Manage: '#39C7B2',
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { view, navigate, session, workspaceId, setWorkspace, environment, setEnvironment, paletteOpen, setPaletteOpen, refreshKey, bumpRefresh } = useAppStore()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [pendingApprovals, setPendingApprovals] = useState(0)
  const [notifications, setNotifications] = useState<{ id: string; title: string; body: string; severity: string; kind: string; linkView: string; createdAt: string; readAt: string | null }[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!workspaceId) return
    let timer: ReturnType<typeof setInterval> | null = null
    const load = async () => {
      try {
        const res = await api<{ approvals: { id: string }[] }>(`/api/approvals?status=pending`)
        setPendingApprovals(res.approvals.length)
        const act = await api<{ notifications: typeof notifications }>(`/api/activity?take=8`)
        setNotifications(act.notifications)
      } catch { /* polling errors are non-fatal */ }
    }
    load()
    timer = setInterval(load, 10000)
    return () => { if (timer) clearInterval(timer) }
  }, [workspaceId, refreshKey])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setPaletteOpen])

  const currentGroup = useMemo(() => NAV_GROUPS.find((g) => g.items.some((i) => i.id === view)), [view])
  const activeWorkspace = session?.workspaces?.find((w) => w.id === workspaceId)
  const unread = notifications.filter((n) => !n.readAt)

  const sidebar = (
    <aside className="flex h-full w-60 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-2.5 px-4 h-16 border-b border-sidebar-border shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/azimara-mesh-mark.svg" alt="AZIMARA MESH" className="h-8 w-8" />
        <div className="leading-tight">
          <p className="text-caption font-bold tracking-wide text-foreground">AZIMARA <span className="brand-gradient-text">MESH</span></p>
          <p className="text-micro text-muted-foreground">Agent Fleet OS</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4" aria-label="Product navigation">
        {NAV_GROUPS.map((g) => (
          <div key={g.group}>
            <p className="px-2 pb-1 text-micro font-semibold uppercase tracking-[0.12em]" style={{ color: GROUP_ACCENT[g.group] }}>{g.group}</p>
            <ul className="space-y-0.5">
              {g.items.map((item) => {
                const Icon = item.icon
                const active = view === item.id
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => { navigate(item.id); setMobileNavOpen(false) }}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'w-full flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-body-sm motion-fast transition-colors',
                        active
                          ? 'bg-elevated text-foreground font-medium border border-border'
                          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground border border-transparent',
                      )}
                    >
                      <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-[#8B7CFF]' : 'text-muted-foreground')} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3 space-y-2 shrink-0">
        <label className="text-micro text-muted-foreground">Environment</label>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-panel p-1" role="radiogroup" aria-label="Environment selector">
          {(['development', 'staging', 'production'] as const).map((env) => (
            <button
              key={env}
              role="radio"
              aria-checked={environment === env}
              onClick={() => setEnvironment(env)}
              className={cn(
                'rounded-md px-1 py-1 text-micro motion-fast',
                environment === env ? 'bg-elevated text-foreground font-medium' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {env === 'development' ? 'dev' : env === 'staging' ? 'staging' : 'prod'}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between text-micro text-muted-foreground">
          <span>Plan</span>
          <Badge variant="outline" className="text-micro capitalize border-[#8B7CFF]/40 text-[#8B7CFF]">{session?.organization?.planTier ?? 'team'}</Badge>
        </div>
      </div>
    </aside>
  )

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen bg-background">
        <div className="hidden lg:block sticky top-0 h-screen shrink-0">{sidebar}</div>

        {mobileNavOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setMobileNavOpen(false)} />
            <div className="absolute left-0 top-0 h-full z-50">{sidebar}</div>
          </div>
        )}

        <div className="flex-1 min-w-0 flex flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/95 px-4 lg:px-6">
            <Button variant="ghost" size="icon" className="lg:hidden h-9 w-9" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation">
              <Menu className="h-4.5 w-4.5" />
            </Button>

            {/* Workspace switcher */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-lg border border-border bg-panel px-2.5 py-1.5 hover:bg-elevated motion-fast max-w-[220px]">
                  <span className="h-2 w-2 rounded-full bg-[#42D9E8]" />
                  <span className="text-caption font-medium truncate">{activeWorkspace?.name ?? 'Workspace'}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel className="text-micro text-muted-foreground">Workspaces · {session?.organization?.name}</DropdownMenuLabel>
                {session?.workspaces?.map((w) => (
                  <DropdownMenuItem key={w.id} onClick={() => setWorkspace(w.id)} className="gap-2">
                    <span className={cn('h-2 w-2 rounded-full', w.id === workspaceId ? 'bg-[#42D9E8]' : 'bg-muted-foreground/40')} />
                    <div className="min-w-0">
                      <p className="text-caption truncate">{w.name}</p>
                      <p className="text-micro text-muted-foreground">role: {w.role} · cap ${w.monthlyBudget}</p>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {session?.isDemo && (
              <span data-testid="demo-mode-badge" title="Seeded demo tenant — demo accounts land on role boards" className="shrink-0 rounded-md border border-[#F2B95D]/50 bg-[#F2B95D]/10 px-1.5 py-0.5 text-micro font-semibold tracking-wider text-[#F2B95D]">DEMO MODE</span>
            )}

            <div className="hidden md:flex items-center gap-1.5 text-caption text-muted-foreground">
              <span className="text-foreground/70">{currentGroup?.group}</span>
              <span>/</span>
              <span className="text-foreground font-medium">{NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === view)?.label}</span>
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={() => setPaletteOpen(true)}
                className="hidden md:flex items-center gap-2 rounded-lg border border-border bg-panel px-3 py-1.5 text-caption text-muted-foreground hover:bg-elevated motion-fast"
              >
                <Search className="h-3.5 w-3.5" />
                Search or jump…
                <kbd className="rounded border border-border bg-elevated px-1 text-micro font-mono">⌘K</kbd>
              </button>

              {/* Approvals */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => navigate('executions', { status: 'waiting_approval' })}
                    className="relative rounded-lg border border-border bg-panel p-2 hover:bg-elevated motion-fast"
                    aria-label={`Pending approvals: ${pendingApprovals}`}
                  >
                    <BadgeCheck className={cn('h-4 w-4', pendingApprovals > 0 ? 'text-[#F2B95D]' : 'text-muted-foreground')} />
                    {pendingApprovals > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#F2B95D] px-1 text-micro font-bold text-[#0B1020] tnum">
                        {pendingApprovals}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>Human approvals ({pendingApprovals} pending)</TooltipContent>
              </Tooltip>

              {/* Notifications */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="relative rounded-lg border border-border bg-panel p-2 hover:bg-elevated motion-fast" aria-label="Notifications">
                    <Bell className="h-4 w-4 text-muted-foreground" />
                    {unread.length > 0 && <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#8B7CFF] px-1 text-micro font-bold text-[#0B1020] tnum">{unread.length}</span>}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
                  <DropdownMenuLabel className="flex items-center justify-between">
                    <span className="text-caption">Notifications</span>
                    <button className="text-micro text-[#8B7CFF] hover:underline" onClick={async () => { await api('/api/activity', { method: 'POST', body: { op: 'mark_all_read' } }); bumpRefresh() }}>mark all read</button>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {notifications.length === 0 && <p className="px-3 py-4 text-caption text-muted-foreground">Nothing new.</p>}
                  {notifications.map((n) => (
                    <DropdownMenuItem key={n.id} className="flex-col items-start gap-0.5" onClick={() => n.linkView && navigate(n.linkView as ViewId)}>
                      <div className="flex items-center gap-2 w-full">
                        <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', n.severity === 'critical' ? 'bg-[#F06B7A]' : n.severity === 'notice' ? 'bg-[#F2B95D]' : 'bg-[#5D8CFF]', !n.readAt && 'ring-2 ring-current/30')} />
                        <p className="text-caption font-medium leading-tight">{n.title}</p>
                      </div>
                      <p className="text-micro text-muted-foreground">{n.body}</p>
                      <p className="text-micro text-muted-foreground/70">{timeAgo(n.createdAt)}</p>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* User menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-lg border border-border bg-panel pl-1.5 pr-2.5 py-1 hover:bg-elevated motion-fast">
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-full text-micro font-bold text-[#0B1020]"
                      style={{ background: `hsl(${session?.user?.avatarHue ?? 262} 70% 72%)` }}
                    >
                      {session?.user?.name?.split(' ').map((p) => p[0]).slice(0, 2).join('') ?? 'A'}
                    </span>
                    <span className="hidden sm:block text-caption font-medium">{session?.user?.name?.split(' ')[0]}</span>
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <p className="text-caption">{session?.user?.name}</p>
                    <p className="text-micro text-muted-foreground">{session?.user?.email} · {activeWorkspace?.role}</p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('settings')}><Settings className="h-3.5 w-3.5 mr-2" />Settings</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('identity')}><KeyRound className="h-3.5 w-3.5 mr-2" />Identity & Access</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={async () => { await api('/api/auth', { method: 'DELETE' }); window.location.reload() }} className="text-[#F06B7A]">
                    <LogOut className="h-3.5 w-3.5 mr-2" />Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <main className="flex-1 p-4 lg:p-6 max-w-[1600px] w-full mx-auto" id="main">
            {children}
          </main>

          <footer className="mt-auto border-t border-border px-6 py-3 flex items-center justify-between text-micro text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="inline-block h-1.5 w-1.5 rounded-full bg-[#35C991]" />Governed runtime active · in-process demo deployment</span>
            <span>AZIMARA MESH · Every Agent. One Governed System.</span>
          </footer>
        </div>
      </div>

      {/* Command palette */}
      <Dialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <DialogContent className="radius-modal p-0 max-w-xl top-[20%] translate-y-0">
          <DialogTitle className="sr-only">Command palette</DialogTitle>
          <div className="border-b border-border px-3 py-2.5 flex items-center gap-2">
            <Command className="h-4 w-4 text-[#8B7CFF]" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Jump to a page or action…"
              className="border-0 bg-transparent focus-visible:ring-0 h-8"
            />
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.group })))
              .filter((i) => i.label.toLowerCase().includes(search.toLowerCase()))
              .map((i) => (
                <button
                  key={i.id}
                  onClick={() => { navigate(i.id); setPaletteOpen(false); setSearch('') }}
                  className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-body-sm hover:bg-elevated motion-fast"
                >
                  <i.icon className="h-4 w-4 text-muted-foreground" />
                  <span>{i.label}</span>
                  <span className="ml-auto text-micro text-muted-foreground">{i.group}</span>
                </button>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}
