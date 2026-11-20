'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, landingViewFor, useAppStore, type SessionData } from '@/lib/client'
import { ErrorNote } from '@/components/mesh/kit'
import { ShieldCheck } from 'lucide-react'

const DEMO_ACCOUNTS = [
  { email: 'ada@azimara.ai', role: 'Owner', name: 'Ada Okafor' },
  { email: 'marco@azimara.ai', role: 'Admin', name: 'Marco Silva' },
  { email: 'yuki@azimara.ai', role: 'Operator', name: 'Yuki Tanaka' },
  { email: 'lena@azimara.ai', role: 'Viewer', name: 'Lena Fischer' },
]

export function LoginView() {
  const setSession = useAppStore((s) => s.setSession)
  const navigate = useAppStore((s) => s.navigate)
  const [email, setEmail] = useState('ada@azimara.ai')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setLoading(true)
    setError(null)
    try {
      // The POST returns the full session context; apply it in-place and land on the
      // role board directly — no page reload, so the redirect cannot bounce.
      const session = await api<SessionData>('/api/auth', { method: 'POST', body: { email, password } })
      setSession(session)
      navigate(landingViewFor(session))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 grid-surface opacity-40" aria-hidden />
      <div className="relative w-full max-w-md">
        <div className="rounded-2xl border border-border bg-card p-6 elev-3 radius-modal">
          <div className="flex items-center gap-3 mb-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/azimara-mesh-mark.svg" alt="AZIMARA MESH" className="h-10 w-10" />
            <div>
              <p className="text-h4 font-bold tracking-wide">AZIMARA <span className="brand-gradient-text">MESH</span></p>
              <p className="text-micro text-muted-foreground">The Governed Operating Fabric for Autonomous AI</p>
            </div>
          </div>
          <p className="text-caption text-muted-foreground mb-5">Enterprise AI Agent Fleet Operating System</p>

          <form onSubmit={submit} className="space-y-3.5" data-testid="login-form">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-caption">Work email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="radius-control bg-panel" autoComplete="username" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-caption">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="radius-control bg-panel" autoComplete="current-password" />
            </div>
            {error && <ErrorNote message={error} />}
            <Button type="submit" disabled={loading} className="w-full radius-button font-semibold">
              {loading ? 'Verifying…' : 'Sign in to the Mesh'}
            </Button>
          </form>

          <div className="mt-5 rounded-xl border border-border bg-panel p-3">
            <p className="text-micro text-muted-foreground mb-2">Demo organization accounts — password <span className="font-mono text-foreground">Azimara#2024</span></p>
            <div className="grid grid-cols-2 gap-1.5">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  onClick={() => { setEmail(a.email); setPassword('Azimara#2024') }}
                  className="flex items-center justify-between rounded-lg border border-border bg-elevated px-2.5 py-1.5 text-caption hover:border-[#8B7CFF]/40 motion-fast"
                >
                  <span>{a.name}</span>
                  <span className="text-micro text-muted-foreground">{a.role}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-micro text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-[#35C991]" />
          Every consequential operation is policy-checked, metered and audited.
        </p>
      </div>
    </div>
  )
}
