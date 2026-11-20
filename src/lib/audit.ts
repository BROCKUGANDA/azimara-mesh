// Immutable audit trail writer. Every consequential operation flows through here.

import { db } from '@/lib/db'

export type AuditSeverity = 'info' | 'notice' | 'warning' | 'critical'

export interface AuditInput {
  organizationId: string
  workspaceId?: string | null
  actorType?: 'user' | 'agent' | 'system' | 'service_identity'
  actorId?: string
  actorName?: string
  action: string
  resourceType?: string
  resourceId?: string
  severity?: AuditSeverity
  detail?: Record<string, unknown>
  ip?: string
}

export async function audit(input: AuditInput): Promise<void> {
  try {
    await db.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId ?? null,
        actorType: input.actorType ?? 'user',
        actorId: input.actorId ?? '',
        actorName: input.actorName ?? '',
        action: input.action,
        resourceType: input.resourceType ?? '',
        resourceId: input.resourceId ?? '',
        severity: input.severity ?? 'info',
        detailJson: JSON.stringify(input.detail ?? {}),
        ip: input.ip ?? '10.0.0.0',
      },
    })
  } catch (err) {
    // Audit failures must never break the operation silently — surface to logs.
    console.error('[audit] failed to persist audit event', input.action, err)
  }
}

export function newCorrelationId(): string {
  return `corr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}
