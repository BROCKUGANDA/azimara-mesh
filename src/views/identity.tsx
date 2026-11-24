'use client'

import { api, useApi, fmtDate, timeAgo, type UserSessionRow } from '@/lib/client'
import { PageHeader, Section, DataTable, StatusChip, ErrorNote, LoadingBlock, EmptyState } from '@/components/mesh/kit'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { useState } from 'react'
import { KeyRound, Monitor, Plus, ShieldOff, UserPlus } from 'lucide-react'

interface MemberRow extends Record<string, unknown> { id: string; userId: string; name: string; email: string; title: string; role: string; status: string; mfaEnabled: boolean; joinedAt: string }

function deviceLabel(ua: string): string {
  if (!ua) return 'Unknown device'
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  const os = /Windows/.test(ua) ? 'Windows'
    : /Mac OS|Macintosh/.test(ua) ? 'macOS'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad/.test(ua) ? 'iOS'
    : /Linux/.test(ua) ? 'Linux' : 'Device'
  return `${browser} · ${os}`
}

export function IdentityView() {
  const { data, error, loading, reload } = useApi<{
    members: MemberRow[]
    identities: Record<string, unknown>[]
    apiKeys: Record<string, unknown>[]
    ssoStatus: string
  }>('/api/identity')
  const { data: sessionsData, error: sessionsError, loading: sessionsLoading, reload: reloadSessions } = useApi<{ sessions: UserSessionRow[] }>('/api/sessions')
  const [newSecret, setNewSecret] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('viewer')
  const [revoking, setRevoking] = useState(false)

  const changeRole = async (membershipId: string, role: string) => {
    try {
      await api('/api/identity', { method: 'POST', body: { op: 'change_role', membershipId, role } })
      toast.success(`Role changed to ${role}`)
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  const createKey = async () => {
    try {
      const res = await api<{ secret: string }>('/api/identity', { method: 'POST', body: { op: 'create_api_key', name: `key-${Date.now() % 10000}`, scopes: ['executions:read', 'executions:write'] } })
      setNewSecret(res.secret)
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  const revokeKey = async (keyId: string) => {
    try {
      await api('/api/identity', { method: 'POST', body: { op: 'revoke_api_key', keyId } })
      toast.success('API key revoked')
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  const invite = async () => {
    try {
      await api('/api/identity', { method: 'POST', body: { op: 'invite', name: inviteEmail, role: inviteRole } })
      toast.success('Member added')
      setInviteEmail('')
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  const revokeSession = async (sid: string) => {
    try {
      await api('/api/sessions', { method: 'POST', body: { op: 'revoke', sid } })
      toast.success('Session revoked')
      reloadSessions()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  const revokeOtherSessions = async () => {
    setRevoking(true)
    try {
      const res = await api<{ revoked: number }>('/api/sessions', { method: 'POST', body: { op: 'revoke_others' } })
      toast.success(`Signed out ${res.revoked} other session${res.revoked === 1 ? '' : 's'}`)
      reloadSessions()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setRevoking(false)
    }
  }

  return (
    <div className="space-y-5" data-testid="identity-view">
      <PageHeader
        title="Identity & Access"
        subtitle="RBAC roles per workspace, agent workload identities, service accounts and scoped API keys. Edit / deploy / production-authorize permissions are separated."
      />
      {error && <ErrorNote message={error} />}

      <Section title="Workspace members" description="Role hierarchy: owner → admin → operator → viewer">
        {loading && !data ? <LoadingBlock /> : (
          <DataTable
            rows={data?.members ?? []}
            columns={[
              { key: 'name', label: 'Member', render: (m) => (
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full text-micro font-bold text-[#0B1020]" style={{ background: `hsl(${m.avatarHue ?? 210} 70% 72%)` }}>{String(m.name).split(' ').map((p) => p[0]).slice(0, 2).join('')}</span>
                  <div><p className="font-medium">{m.name}</p><p className="text-micro text-muted-foreground">{m.email} · {m.title}</p></div>
                </div>
              ) },
              { key: 'role', label: 'Role', render: (m) => (
                <Select value={String(m.role)} onValueChange={(v) => changeRole(String(m.id), v)}>
                  <SelectTrigger className="h-7 w-28 radius-control bg-panel text-caption"><SelectValue /></SelectTrigger>
                  <SelectContent>{['owner', 'admin', 'operator', 'viewer'].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              ) },
              { key: 'mfaEnabled', label: 'MFA', render: (m) => m.mfaEnabled ? <span className="text-caption text-[#35C991]">enabled</span> : <span className="text-caption text-muted-foreground">—</span> },
              { key: 'status', label: 'Status', render: (m) => <StatusChip status={m.status} size="xs" /> },
              { key: 'joinedAt', label: 'Joined', render: (m) => fmtDate(m.joinedAt) },
            ]}
          />
        )}
        <div className="flex gap-2 mt-3">
          <Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="Existing org user email" className="h-9 max-w-xs radius-control bg-panel" />
          <Select value={inviteRole} onValueChange={setInviteRole}>
            <SelectTrigger className="h-9 w-28 radius-control bg-panel text-caption"><SelectValue /></SelectTrigger>
            <SelectContent>{['admin', 'operator', 'viewer'].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" className="radius-button" disabled={!inviteEmail.trim()} onClick={invite}><UserPlus className="h-3.5 w-3.5 mr-1" />Add member</Button>
        </div>
      </Section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Section title="Agent workload identities" description="Distinguishable from owner, operator, worker and model provider — scoped, revocable, rotatable">
          <DataTable
            rows={(data?.identities ?? []).slice(0, 12)}
            columns={[
              { key: 'name', label: 'Identity', render: (i) => <span className="font-mono text-caption">{i.name}</span> },
              { key: 'kind', label: 'Kind', render: (i) => <span className="text-caption">{String(i.kind).replace('_', ' ')}</span> },
              { key: 'scopes', label: 'Scopes', render: (i) => <span className="font-mono text-micro text-muted-foreground">{(i.scopes as string[]).join(', ')}</span> },
              { key: 'status', label: 'Status', render: (i) => <StatusChip status={i.status === 'active' ? 'succeeded' : i.status} size="xs" /> },
              { key: 'lastUsedAt', label: 'Last used', render: (i) => timeAgo(i.lastUsedAt) },
            ]}
          />
        </Section>

        <Section title="API keys" description="Hashed at rest; the raw secret is shown exactly once" actions={
          <Button size="sm" variant="outline" className="radius-button" onClick={createKey}><KeyRound className="h-3.5 w-3.5 mr-1" />Create key</Button>
        }>
          {newSecret && (
            <div className="mb-3 rounded-lg border border-[#F2B95D]/40 bg-[#F2B95D]/10 p-3">
              <p className="text-caption font-medium text-[#F2B95D]">Copy this key now — it cannot be retrieved again</p>
              <p className="font-mono text-caption mt-1 break-all">{newSecret}</p>
            </div>
          )}
          <DataTable
            rows={data?.apiKeys ?? []}
            columns={[
              { key: 'name', label: 'Key', render: (k) => (
                <div><p className="font-medium">{k.name}</p><p className="text-micro text-muted-foreground font-mono">{k.prefix}…</p></div>
              ) },
              { key: 'scopes', label: 'Scopes', render: (k) => <span className="font-mono text-micro text-muted-foreground">{(k.scopes as string[]).join(', ')}</span> },
              { key: 'status', label: 'Status', render: (k) => <StatusChip status={k.status === 'active' ? 'succeeded' : k.status} size="xs" /> },
              { key: 'lastUsedAt', label: 'Last used', render: (k) => timeAgo(k.lastUsedAt) },
              { key: 'actions', label: '', align: 'right', render: (k) => k.status === 'active' ? (
                <Button variant="ghost" size="sm" className="h-7 text-[#F06B7A] hover:text-[#F06B7A]" onClick={() => revokeKey(String(k.id))}><ShieldOff className="h-3.5 w-3.5" /></Button>
              ) : null },
            ]}
          />
        </Section>
      </div>

      <Section
        title="Active sessions"
        description="Every signed-in browser for this account. Revoking a session signs that device out immediately."
        actions={
          <Button size="sm" variant="outline" className="radius-button" disabled={revoking} onClick={revokeOtherSessions}>
            <Monitor className="h-3.5 w-3.5 mr-1" />{revoking ? 'Signing out…' : 'Sign out other sessions'}
          </Button>
        }
      >
        {sessionsError && <ErrorNote message={sessionsError} />}
        {sessionsLoading && !sessionsData ? <LoadingBlock /> : (
          <DataTable
            rows={sessionsData?.sessions ?? []}
            columns={[
              { key: 'device', label: 'Device', render: (s) => (
                <div><p className="font-medium">{deviceLabel(s.userAgent)}</p><p className="text-micro text-muted-foreground font-mono">{s.id.slice(0, 12)}…</p></div>
              ) },
              { key: 'ip', label: 'IP address', render: (s) => <span className="font-mono text-caption text-muted-foreground">{s.ip || '—'}</span> },
              { key: 'createdAt', label: 'Signed in', render: (s) => fmtDate(s.createdAt) },
              { key: 'lastActiveAt', label: 'Last active', render: (s) => timeAgo(s.lastActiveAt) },
              { key: 'expiresAt', label: 'Expires', render: (s) => fmtDate(s.expiresAt) },
              { key: 'status', label: 'Status', render: (s) => s.current ? <Badge variant="outline" className="border-[#35C991]/40 text-[#35C991] text-micro">This device</Badge> : <StatusChip status="active" size="xs" /> },
              { key: 'actions', label: '', align: 'right', render: (s) => s.current ? null : (
                <Button variant="ghost" size="sm" className="h-7 text-[#F06B7A] hover:text-[#F06B7A]" onClick={() => revokeSession(s.id)}><ShieldOff className="h-3.5 w-3.5" /></Button>
              ) },
            ]}
          />
        )}
      </Section>

      <Section title="Enterprise SSO & SCIM">
        <EmptyState title="SSO / SCIM — Enterprise tier roadmap" hint="SAML/OIDC SSO, SCIM provisioning, audit-retention exports and dedicated runtime pools ship with the Enterprise offering. This demo deployment uses scoped local accounts with MFA flag support." />
      </Section>
    </div>
  )
}
