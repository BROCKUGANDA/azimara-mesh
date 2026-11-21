// Emergency operator health endpoint. Deliberately independent of Temporal,
// NATS and the telemetry collector so it remains usable while those are being
// investigated. Checks only the authoritative database.
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { temporalEnabled } from '@/temporal/client'
import { telemetryEnabled } from '@/lib/telemetry'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const started = Date.now()
  let database = 'ok'
  try {
    await db.$queryRaw`SELECT 1`
  } catch {
    database = 'error'
  }
  const latencyMs = Date.now() - started
  const healthy = database === 'ok' && latencyMs < 2000
  return Response.json({
    status: healthy ? 'ok' : 'degraded',
    checks: { database, latencyMs },
    adapters: {
      temporal: temporalEnabled() ? 'enabled' : 'inprocess',
      telemetry: telemetryEnabled() ? 'enabled' : 'disabled',
      sandbox: process.env.AGENT_SANDBOX ?? 'inprocess',
    },
    timestamp: new Date().toISOString(),
  }, { status: healthy ? 200 : 503 })
}
