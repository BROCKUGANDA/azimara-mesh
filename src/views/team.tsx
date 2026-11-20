'use client'

import { api, useApi, fmtDate } from '@/lib/client'
import { PageHeader, Section, DataTable, StatusChip, ErrorNote, LoadingBlock } from '@/components/mesh/kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { useState } from 'react'
import { UserPlus } from 'lucide-react'

interface MemberRow extends Record<string, unknown> { id: string; name: string; email: string; title: string; role: string; status: string; mfaEnabled: boolean; joinedAt: string }

export function TeamView() {
  const { data, error, loading, reload } = useApi<{ members: MemberRow[] }>('/api/identity')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('viewer')

  const changeRole = async (membershipId: string, role: string) => {
    try {
      await api('/api/identity', { method: 'POST', body: { op: 'change_role', membershipId, role } })
      toast.success(`Role changed to ${role}`)
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

  return (
    <div className="space-y-5" data-testid="team-view">
      <PageHeader title="Team Management" subtitle="Shared workspace membership with role-based access. Owners manage roles; every change is audited." />
      {error && <ErrorNote message={error} />}

      <Section title="Members">
        {loading && !data ? <LoadingBlock /> : (
          <DataTable
            rows={data?.members ?? []}
            columns={[
              { key: 'name', label: 'Member', render: (m) => (
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full text-micro font-bold text-[#0B1020]" style={{ background: `hsl(${m.avatarHue ?? 210} 70% 72%)` }}>{String(m.name).split(' ').map((p) => p[0]).slice(0, 2).join('')}</span>
                  <div><p className="font-medium">{m.name}</p><p className="text-micro text-muted-foreground">{m.title}</p></div>
                </div>
              ) },
              { key: 'email', label: 'Email', render: (m) => <span className="text-caption">{m.email}</span> },
              { key: 'role', label: 'Role', render: (m) => (
                <Select value={String(m.role)} onValueChange={(v) => changeRole(String(m.id), v)}>
                  <SelectTrigger className="h-7 w-28 radius-control bg-panel text-caption"><SelectValue /></SelectTrigger>
                  <SelectContent>{['owner', 'admin', 'operator', 'viewer'].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              ) },
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
          <Button variant="outline" className="radius-button" disabled={!inviteEmail.trim()} onClick={invite}><UserPlus className="h-3.5 w-3.5 mr-1" />Add</Button>
        </div>
      </Section>
    </div>
  )
}
