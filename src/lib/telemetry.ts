// OpenTelemetry instrumentation, optional and lazy. No force-flush on hot paths.
// Raw payloads are never recorded; only IDs and redacted summaries.
import type { Tracer } from '@opentelemetry/api'

let tracer: Tracer | null = null
let started = false

export function telemetryEnabled(): boolean {
  return Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT)
}

export async function getTracer(name: string): Promise<Tracer | null> {
  if (!telemetryEnabled()) return null
  if (!started) {
    started = true
    try {
      const { NodeSDK } = await import('@opentelemetry/sdk-node')
      const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http')
      const sdk = new NodeSDK({ traceExporter: new OTLPTraceExporter() })
      sdk.start()
    } catch {
      // Observability must never break the application.
      return null
    }
  }
  const { trace } = await import('@opentelemetry/api')
  if (!tracer) tracer = trace.getTracer(name)
  return tracer
}

export interface CorrelationFields {
  organizationId?: string
  workspaceId?: string
  workflowId?: string
  agentId?: string
  executionId?: string
  correlationId?: string
}

export function spanAttributes(fields: CorrelationFields): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value) out[`mesh.${key}`] = value
  }
  return out
}
