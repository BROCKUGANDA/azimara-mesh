import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiContext, withApi } from '@/lib/api-utils'
import { usageBreakdown, monthSpend } from '@/lib/metering'

export async function GET(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req)
    const [breakdown, spend] = await Promise.all([
      usageBreakdown(ctx.workspaceId),
      monthSpend(ctx.workspaceId),
    ])
    const warnings: string[] = []
    if (breakdown.cap > 0 && breakdown.forecast > breakdown.cap) warnings.push(`Forecast $${breakdown.forecast.toFixed(2)} exceeds the monthly cap of $${breakdown.cap.toFixed(2)}`)
    if (breakdown.cap > 0 && breakdown.spent > breakdown.cap * 0.9) warnings.push('Month-to-date spend is above 90% of the cap')
    return { breakdown, spend: Math.round(spend * 100) / 100, warnings }
  })
}
