'use client'

import { api, useApi, fmtUsd, fmtDate } from '@/lib/client'
import { PageHeader, Section, StatusChip, ErrorNote, LoadingBlock, MetricCard, DataTable } from '@/components/mesh/kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { useState } from 'react'

interface BillingData {
  rails: { type: string; network: string; chainId: number | null; treasuryAddress: string | null; usdcAddress: string | null }
  plans: { id: string; slug: string; name: string; priceMonth: number; maxAgents: number; maxSeats: number; includedCredits: number; features: string[] }[]
  subscription: { plan: string; planSlug: string; priceMonth: number; includedCredits: number; maxAgents: number; maxSeats: number; status: string; seats: number; spendCapUsd: number; currentPeriodStart: string; currentPeriodEnd: string } | null
  credits: { balanceUsd: number }
  settlements: { id: string; periodStart: string; periodEnd: string; usageUsd: number; creditsAppliedUsd: number; remainingUsd: number; status: string; onchainSignature: string | null }[]
  invoices: { id: string; number: string; periodStart: string; periodEnd: string; subtotalUsd: number; creditsUsd: number; totalUsd: number; status: string; lines: { kind: string; quantity: number; cost: number }[] }[]
  usage: { spent: number; forecast: number; cap: number; byKind: { kind: string; cost: number; quantity: number }[] }
}

const TIER_ORDER = ['community', 'builder', 'team', 'enterprise']

export function BillingView() {
  const { data, error, loading, reload } = useApi<BillingData>('/api/billing')
  const [cap, setCap] = useState('')
  const [signature, setSignature] = useState('')
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null)
  const sub = data?.subscription

  const verifyPayment = async () => {
    try {
      const result = await api<{ duplicate: boolean; amountUsd: number }>('/api/billing/payments', {
        method: 'POST', body: { signature: signature.trim() },
      })
      toast.success(result.duplicate ? 'Payment already credited' : `Credited ${fmtUsd(result.amountUsd)}`)
      setSignature('')
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Payment verification failed')
    }
  }

  const settle = async () => {
    try {
      const result = await api<{ remainingUsd: number; status: string }>('/api/billing', {
        method: 'POST', body: { op: 'settle_usage' },
      })
      toast.success(result.status === 'settled' ? 'Period settled in full' : `Settled; ${fmtUsd(result.remainingUsd)} pending onchain`)
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Settlement failed')
    }
  }

  const changePlan = async (slug: string) => {
    try {
      await api('/api/billing', { method: 'POST', body: { op: 'change_plan', planSlug: slug } })
      toast.success(`Plan changed to ${slug}`)
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Plan change rejected')
    }
  }

  const setSpendCap = async () => {
    try {
      await api('/api/billing', { method: 'POST', body: { op: 'set_spend_cap', spendCapUsd: Number(cap) } })
      toast.success(`Spend cap set to ${fmtUsd(Number(cap))}`)
      setCap('')
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  return (
    <div className="space-y-5" data-testid="billing-view">
      <PageHeader title="Billing" subtitle="Onchain USDC credits on Base. Verify a transfer to credit your workspace; metered usage draws credits down and any remainder becomes a pending onchain settlement." />
      {error && <ErrorNote message={error} />}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Payment rail" value="BASE · USDC" accent="violet" sub={data?.rails.network ?? '—'} loading={loading} />
        <MetricCard label="USDC credit balance" value={fmtUsd(data?.credits.balanceUsd)} accent="teal" sub="verified onchain only" loading={loading} />
        <MetricCard label="Month-to-date usage" value={fmtUsd(data?.usage.spent)} accent="cyan" loading={loading} />
        <MetricCard label="Spend cap" value={fmtUsd(data?.usage.cap)} accent={data && data.usage.forecast > data.usage.cap ? 'danger' : 'blue'} sub={data ? `forecast ${fmtUsd(data.usage.forecast)}` : ''} loading={loading} />
      </div>

      <Section title="Plans" description="Upgrade path — Community → Builder → Team → Enterprise">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {(data?.plans ?? []).map((p) => {
            const current = sub?.planSlug === p.slug
            const disabled = p.slug === 'enterprise'
            return (
              <div key={p.id} className={`rounded-xl border p-4 ${current ? 'border-[#8B7CFF]/60 bg-[#8B7CFF]/8' : 'border-border bg-card'}`}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-body-sm font-semibold">{p.name}</p>
                  {current && <StatusChip status="succeeded" size="xs" />}
                </div>
                <p className="text-h3 tnum text-[#8B7CFF]">{p.priceMonth > 0 ? `$${p.priceMonth}` : p.slug === 'enterprise' ? 'custom' : 'Free'}<span className="text-caption text-muted-foreground">{p.priceMonth > 0 ? '/mo' : ''}</span></p>
                <p className="text-micro text-muted-foreground mt-1 tnum">{p.maxAgents} agents · {p.maxSeats} seats · {fmtUsd(p.includedCredits)} credits</p>
                <ul className="text-micro text-muted-foreground mt-2 space-y-1 list-disc pl-4">
                  {p.features.slice(0, 4).map((f) => <li key={f}>{f}</li>)}
                </ul>
                {!current && !disabled && (
                  <Button size="sm" variant="outline" className="radius-button w-full mt-3" onClick={() => changePlan(p.slug)}>Switch to {p.name}</Button>
                )}
                {disabled && <p className="text-micro text-muted-foreground mt-3">Contact sales — SSO, SCIM, dedicated pools, custom SLAs.</p>}
              </div>
            )
          })}
        </div>
      </Section>

      <Section title="Onchain credits" description="Send SPL USDC to the treasury and paste the finalized transaction signature to credit this workspace">
        <div className="flex flex-col md:flex-row gap-2">
          <Input value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Base transaction hash (0x…)" className="radius-control bg-panel font-mono tnum flex-1" />
          <Button variant="outline" className="radius-button" disabled={!signature.trim()} onClick={verifyPayment}>Verify &amp; credit</Button>
        </div>
        <p className="text-caption text-muted-foreground mt-3">
          Treasury: <span className="font-mono">{data?.rails.treasuryAddress ?? '—'}</span> · USDC: <span className="font-mono">{data?.rails.usdcAddress ?? '—'}</span>
        </p>
        <p className="text-caption text-muted-foreground mt-1">Each signature is verified once; duplicate submissions cannot double-credit.</p>
      </Section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Section title="Spend controls" description="Customer-controlled caps enforced before every execution launch">
          <div className="flex gap-2">
            <Input type="number" value={cap} onChange={(e) => setCap(e.target.value)} placeholder={String(sub?.spendCapUsd ?? 400)} className="radius-control bg-panel tnum max-w-40" />
            <Button variant="outline" className="radius-button" disabled={!cap} onClick={setSpendCap}>Update cap</Button>
          </div>
          <p className="text-caption text-muted-foreground mt-3">Caps trigger usage warnings at 90% and hard-block new runs at 100% with an audited policy decision.</p>
          <div className="flex items-center gap-2 mt-3">
            <Button variant="outline" size="sm" className="radius-button" onClick={settle}>Settle usage period</Button>
            <span className="text-caption text-muted-foreground">Credits first; remainder stays payable onchain.</span>
          </div>
        </Section>

        <Section title="Onchain settlements" description="Metered usage reconciled against verified USDC credits">
          <DataTable
            rows={(data?.settlements ?? []) as unknown as Record<string, unknown>[]}
            columns={[
              { key: 'periodStart', label: 'Period', render: (s) => fmtDate(s.periodStart) },
              { key: 'usageUsd', label: 'Usage', align: 'right', render: (s) => fmtUsd(s.usageUsd) },
              { key: 'creditsAppliedUsd', label: 'Credits', align: 'right', render: (s) => fmtUsd(s.creditsAppliedUsd) },
              { key: 'remainingUsd', label: 'Remaining', align: 'right', render: (s) => fmtUsd(s.remainingUsd) },
              { key: 'status', label: 'Status', render: (s) => <StatusChip status={s.status === 'settled' ? 'succeeded' : 'warning'} size="xs" /> },
            ]}
          />
        </Section>

        <Section title="Invoices" description="Immutable billing records built from idempotent usage events">
          <DataTable
            rows={(data?.invoices ?? []) as unknown as Record<string, unknown>[]}
            onRowClick={(i) => setSelectedInvoice(String(i.id))}
            columns={[
              { key: 'number', label: 'Invoice', render: (i) => <span className="font-mono text-caption">{i.number}</span> },
              { key: 'periodStart', label: 'Period', render: (i) => fmtDate(i.periodStart) },
              { key: 'subtotalUsd', label: 'Usage', align: 'right', render: (i) => fmtUsd(i.subtotalUsd) },
              { key: 'creditsUsd', label: 'Credits', align: 'right', render: (i) => `−${fmtUsd(i.creditsUsd)}` },
              { key: 'totalUsd', label: 'Total', align: 'right', render: (i) => <span className="font-semibold">{fmtUsd(i.totalUsd)}</span> },
              { key: 'status', label: 'Status', render: (i) => <StatusChip status={i.status === 'paid' ? 'succeeded' : i.status} size="xs" /> },
            ]}
          />
          {selectedInvoice && (() => {
            const inv = data?.invoices.find((x) => x.id === selectedInvoice)
            return inv ? (
              <div className="mt-3">
                <p className="text-caption font-medium mb-1.5">Line items · {inv.number}</p>
                <DataTable
                  rows={inv.lines as unknown as Record<string, unknown>[]}
                  columns={[
                    { key: 'kind', label: 'Meter', render: (l) => <span className="font-mono text-caption">{l.kind}</span> },
                    { key: 'quantity', label: 'Quantity', align: 'right', render: (l) => Math.round((l.quantity as number) * 100) / 100 },
                    { key: 'cost', label: 'Cost', align: 'right', render: (l) => fmtUsd(l.cost) },
                  ]}
                />
              </div>
            ) : null
          })()}
        </Section>
      </div>
    </div>
  )
}
