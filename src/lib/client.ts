'use client'

// Client-side API helper + typed fetch. Injects the active workspace header.

import { create } from 'zustand'
import { useEffect, useState } from 'react'
import type { ViewId } from '@/lib/types'

export interface SessionData {
  authenticated: boolean
  user?: { id: string; email: string; name: string; title: string; avatarHue: number }
  workspaces?: { id: string; name: string; slug: string; role: string; organizationId: string; dataClassification: string; monthlyBudget: number }[]
  organization?: { id: string; name: string; planTier: string }
  activeWorkspaceId?: string | null
  activeRole?: string | null
  isDemo?: boolean
}

export type UserSessionRow = {
  id: string
  createdAt: string
  lastActiveAt: string
  expiresAt: string
  userAgent: string
  ip: string
  current: boolean
}

/** Post-sign-in landing board — demo tenants get a role-tailored board, real users land on the production overview. */
export function landingViewFor(s: SessionData | null | undefined): ViewId {
  if (!s?.authenticated) return 'overview'
  if (!s.isDemo) return 'overview' // real users → production command board
  switch (s.activeRole) {
    case 'admin': return 'fleet'
    case 'operator': return 'executions'
    case 'viewer': return 'activity'
    default: return 'overview' // demo owner → overview
  }
}

interface AppState {
  session: SessionData | null
  sessionLoaded: boolean
  view: ViewId
  params: Record<string, string>
  environment: 'development' | 'staging' | 'production'
  workspaceId: string | null
  paletteOpen: boolean
  refreshKey: number
  setSession: (s: SessionData | null) => void
  setSessionLoaded: (v: boolean) => void
  navigate: (view: ViewId, params?: Record<string, string>) => void
  setEnvironment: (env: 'development' | 'staging' | 'production') => void
  setWorkspace: (id: string) => void
  setPaletteOpen: (v: boolean) => void
  bumpRefresh: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  session: null,
  sessionLoaded: false,
  view: 'overview',
  params: {},
  environment: 'production',
  workspaceId: null,
  paletteOpen: false,
  refreshKey: 0,
  setSession: (s) => set({ session: s, workspaceId: s?.activeWorkspaceId ?? null }),
  setSessionLoaded: (v) => set({ sessionLoaded: v }),
  navigate: (view, params = {}) => set({ view, params, refreshKey: get().refreshKey + 1 }),
  setEnvironment: (environment) => set({ environment }),
  setWorkspace: (id) => set({ workspaceId: id, refreshKey: get().refreshKey + 1 }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  bumpRefresh: () => set({ refreshKey: get().refreshKey + 1 }),
}))

export function activeWorkspaceId(): string | null {
  return useAppStore.getState().workspaceId
}

export class ApiError extends Error {
  code: string
  status: number
  constructor(code: string, message: string, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

export type ApiInit = Omit<RequestInit, 'body'> & { method?: string; body?: unknown }

export async function api<T>(path: string, init?: ApiInit): Promise<T> {
  const ws = activeWorkspaceId()
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init?.headers as Record<string, string> | undefined ?? {}) }
  if (ws) headers['x-workspace-id'] = ws
  const res = await fetch(path, {
    ...init,
    headers,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  } as RequestInit)
  const data = (await res.json().catch(() => ({}))) as T & { error?: { code: string; message: string } }
  if (!res.ok) {
    throw new ApiError(data?.error?.code ?? 'ERROR', data?.error?.message ?? `Request failed (${res.status})`, res.status)
  }
  return data
}

/**
 * Sign out reliably: revoke the server-side session and clear the cookie, then
 * drop local auth state. Does not depend on a full page reload, so a slow or
 * failed redirect can never leave the UI looking authenticated.
 */
export async function signOut(): Promise<void> {
  try {
    await api('/api/auth', { method: 'DELETE' })
  } finally {
    const store = useAppStore.getState()
    store.setSession(null)
    store.setSessionLoaded(true)
    store.setPaletteOpen(false)
    store.navigate('overview')
  }
}

/** Simple data-fetching hook with optional polling. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useApi<T>(path: string | null, opts?: { pollMs?: number; deps?: unknown[]; refreshKey?: number }): { data: T | null; error: string | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!path) return
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null
    const load = async () => {
      try {
        const result = await api<T>(path)
        if (!cancelled) {
          setData(result)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    setLoading(true)
    load()
    if (opts?.pollMs) timer = setInterval(load, opts.pollMs)
    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...(opts?.deps ?? [])])

  return { data, error, loading, reload: () => setTick((t) => t + 1) }
}

export function fmtUsd(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return `$${n.toFixed(2)}`
}

export function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return n.toLocaleString('en-US')
}

export function fmtMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—'
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms)}ms`
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
