'use client'

// AZIMARA MESH — single-route application shell with client-side view routing.
// The preview gateway exposes only `/`; all 25 product views render here.

import { useEffect, useState } from 'react'
import { useAppStore, api, landingViewFor, type SessionData } from '@/lib/client'
import { AppShell } from '@/components/app-shell'
import { LandingView } from '@/views/landing'
import { LoginView } from '@/views/login'
import { OverviewView } from '@/views/overview'
import { FleetView } from '@/views/fleet'
import { AgentDetailView } from '@/views/agent-detail'
import { WorkflowsView } from '@/views/workflows'
import { ExecutionsView } from '@/views/executions'
import { ExecutionDetailView } from '@/views/execution-detail'
import { SchedulesView } from '@/views/schedules'
import { ActivityView } from '@/views/activity'
import { StudioView } from '@/views/studio'
import { CatalogView } from '@/views/catalog'
import { TemplatesView } from '@/views/catalog'
import { ModelsView } from '@/views/models'
import { ToolsView } from '@/views/tools'
import { MemoryView } from '@/views/memory'
import { EvalsView } from '@/views/evals'
import { PoliciesView } from '@/views/policies'
import { SecurityView } from '@/views/security'
import { IdentityView } from '@/views/identity'
import { AuditView } from '@/views/audit'
import { DeploymentsView } from '@/views/deployments'
import { EnvironmentsView } from '@/views/environments'
import { UsageView } from '@/views/usage'
import { TeamView } from '@/views/team'
import { IntegrationsView } from '@/views/integrations'
import { DevPortalView } from '@/views/devportal'
import { BillingView } from '@/views/billing'
import { SettingsView } from '@/views/settings'

export default function Page() {
  const { view, params, session, sessionLoaded, setSession, setSessionLoaded, navigate } = useAppStore()
  const [authScreen, setAuthScreen] = useState<'landing' | 'login'>('landing')
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoError, setDemoError] = useState<string | null>(null)

  const enterDemo = async () => {
    setDemoLoading(true)
    setDemoError(null)
    try {
      // All identity/role decisions are made server-side; the client simply
      // applies the returned session context and lands on the RBAC board.
      const result = await api<SessionData>('/api/auth/demo', { method: 'POST' })
      setSession(result)
      navigate(landingViewFor(result))
    } catch (err) {
      setDemoError(err instanceof Error ? err.message : 'Demo sign-in failed')
    } finally {
      setDemoLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    api<SessionData>('/api/auth')
      .then((s) => { if (!cancelled) setSession(s) })
      .catch(() => { if (!cancelled) setSession({ authenticated: false }) })
      .finally(() => { if (!cancelled) setSessionLoaded(true) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!sessionLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/azimara-mesh-mark.svg" alt="AZIMARA MESH" className="h-14 w-14 motion-graph" />
          <div className="h-1 w-40 rounded-full overflow-hidden bg-panel mesh-shimmer" />
        </div>
      </div>
    )
  }

  if (!session?.authenticated) {
    if (authScreen === 'login') {
      return <LoginView onBack={() => setAuthScreen('landing')} onDemo={enterDemo} />
    }
    return (
      <LandingView
        onEnterDemo={enterDemo}
        onSignIn={() => setAuthScreen('login')}
        demoLoading={demoLoading}
        demoError={demoError}
      />
    )
  }

  return (
    <AppShell>
      {view === 'overview' && <OverviewView />}
      {view === 'fleet' && (params.agentId ? <AgentDetailView agentId={params.agentId} /> : <FleetView />)}
      {view === 'workflows' && <WorkflowsView />}
      {view === 'executions' && (params.executionId ? <ExecutionDetailView executionId={params.executionId} /> : <ExecutionsView />)}
      {view === 'schedules' && <SchedulesView />}
      {view === 'activity' && <ActivityView />}
      {view === 'studio' && <StudioView />}
      {view === 'catalog' && <CatalogView />}
      {view === 'templates' && <TemplatesView />}
      {view === 'models' && <ModelsView />}
      {view === 'tools' && <ToolsView />}
      {view === 'memory' && <MemoryView />}
      {view === 'evals' && <EvalsView />}
      {view === 'policies' && <PoliciesView />}
      {view === 'security' && <SecurityView />}
      {view === 'identity' && <IdentityView />}
      {view === 'audit' && <AuditView />}
      {view === 'deployments' && <DeploymentsView />}
      {view === 'environments' && <EnvironmentsView />}
      {view === 'usage' && <UsageView />}
      {view === 'team' && <TeamView />}
      {view === 'integrations' && <IntegrationsView />}
      {view === 'devportal' && <DevPortalView />}
      {view === 'billing' && <BillingView />}
      {view === 'settings' && <SettingsView />}
    </AppShell>
  )
}
