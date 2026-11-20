// Security Center monitoring — anomaly detection hooks called by the execution engine
// and governance APIs. Creates classified incidents and supports emergency controls.

import { db } from '@/lib/db'

export interface IncidentInput {
  workspaceId: string
  kind: 'prompt_injection' | 'permission_violation' | 'cost_anomaly' | 'credential_anomaly' | 'data_exfiltration' | 'communication_anomaly' | 'repeated_failure'
  severity: 'low' | 'medium' | 'high' | 'critical'
  title: string
  detail: Record<string, unknown>
  agentId?: string | null
  executionId?: string | null
}

/** Dedupe: max one OPEN incident per (kind, agent, hour) to avoid alert storms. */
export async function raiseIncident(input: IncidentInput): Promise<string | null> {
  const hourAgo = new Date(Date.now() - 3600_000)
  const existing = await db.securityIncident.findFirst({
    where: {
      workspaceId: input.workspaceId,
      kind: input.kind,
      agentId: input.agentId ?? null,
      status: { in: ['open', 'investigating'] },
      openedAt: { gte: hourAgo },
    },
  })
  if (existing) return existing.id
  const row = await db.securityIncident.create({
    data: {
      workspaceId: input.workspaceId,
      kind: input.kind,
      severity: input.severity,
      title: input.title,
      detailJson: JSON.stringify(input.detail),
      agentId: input.agentId ?? null,
      executionId: input.executionId ?? null,
    },
  })
  await db.notification.create({
    data: {
      workspaceId: input.workspaceId,
      kind: 'security',
      title: `${input.severity.toUpperCase()} security: ${input.title}`,
      body: `Incident ${row.id} opened. Review in Security Center.`,
      severity: input.severity === 'low' ? 'info' : input.severity === 'medium' ? 'notice' : 'critical',
      linkView: 'security',
    },
  })
  return row.id
}

/** Permission-violation streak detection: ≥3 denies for one agent in 10 min → incident. */
export async function onPolicyDeny(workspaceId: string, agentId: string | null, action: string, reason: string): Promise<void> {
  if (!agentId) return
  const tenMinAgo = new Date(Date.now() - 600_000)
  const denies = await db.policyDecision.count({
    where: { workspaceId, subject: agentId, decision: 'deny', createdAt: { gte: tenMinAgo } },
  })
  if (denies >= 3) {
    await raiseIncident({
      workspaceId, agentId,
      kind: 'permission_violation',
      severity: 'high',
      title: `Repeated permission denials (${denies} in 10 min)`,
      detail: { action, latestReason: reason, window: '10m', threshold: 3 },
    })
  }
}

export async function onToolOutputScan(
  workspaceId: string, agentId: string | null, executionId: string | null,
  toolSlug: string, injection: { flagged: boolean; pattern?: string },
): Promise<void> {
  if (!injection.flagged) return
  await raiseIncident({
    workspaceId, agentId, executionId,
    kind: 'prompt_injection',
    severity: 'high',
    title: `Prompt-injection pattern in ${toolSlug} output`,
    detail: { tool: toolSlug, matchedPattern: injection.pattern, action: 'output flagged; agent continued with sanitised context' },
  })
}

export async function onExecutionComplete(input: {
  workspaceId: string
  agentId: string | null
  executionId: string
  costUsd: number
  status: string
  agentAvgCost: number
  recentFailures: number
}): Promise<void> {
  // cost anomaly: >8× agent average and > $0.05 absolute
  if (input.agentId && input.costUsd > 0.05 && input.agentAvgCost > 0 && input.costUsd > input.agentAvgCost * 8) {
    await raiseIncident({
      workspaceId: input.workspaceId, agentId: input.agentId, executionId: input.executionId,
      kind: 'cost_anomaly', severity: 'medium',
      title: `Execution cost $${input.costUsd.toFixed(2)} exceeds ${Math.round(input.costUsd / Math.max(input.agentAvgCost, 0.0001))}× agent average`,
      detail: { costUsd: input.costUsd, agentAvgCost: input.agentAvgCost },
    })
  }
  // failure streak
  if (input.status === 'failed' && input.recentFailures >= 3) {
    await raiseIncident({
      workspaceId: input.workspaceId, agentId: input.agentId, executionId: input.executionId,
      kind: 'repeated_failure', severity: 'medium',
      title: `${input.recentFailures} consecutive failed executions`,
      detail: { window: 'last 5 executions' },
    })
  }
}

// --- emergency controls ---------------------------------------------------

export async function suspendAgent(agentId: string, reason: string, actorName: string): Promise<void> {
  await db.agent.update({ where: { id: agentId }, data: { status: 'paused', healthStatus: 'offline' } })
  await db.deployment.updateMany({ where: { agentId, environment: 'production', status: { in: ['healthy', 'degraded'] } }, data: { status: 'suspended' } })
  await auditSuspension('agent', agentId, reason, actorName)
}

export async function suspendTool(toolId: string, reason: string, actorName: string): Promise<void> {
  await db.tool.update({ where: { id: toolId }, data: { status: 'suspended' } })
  await auditSuspension('tool', toolId, reason, actorName)
}

export async function emergencyWorkspaceStop(workspaceId: string, reason: string, actorName: string): Promise<void> {
  await db.agent.updateMany({ where: { workspaceId, status: { in: ['healthy', 'degraded', 'ready', 'deploying', 'scaling'] } }, data: { status: 'paused' } })
  await db.execution.updateMany({ where: { workspaceId, status: { in: ['queued', 'running', 'waiting_approval'] } }, data: { status: 'cancelled', finishedAt: new Date(), error: 'workspace emergency stop' } })
  await db.deployment.updateMany({ where: { workspaceId, environment: 'production', status: { in: ['healthy', 'degraded'] } }, data: { status: 'suspended' } })
  await auditSuspension('workspace', workspaceId, reason, actorName)
}

async function auditSuspension(resourceType: string, resourceId: string, reason: string, actorName: string): Promise<void> {
  const { audit } = await import('@/lib/audit')
  const workspace = resourceType === 'workspace' ? resourceId : (await db.agent.findUnique({ where: { id: resourceId } }) || await db.tool.findUnique({ where: { id: resourceId } }))?.workspaceId
  const ws = workspace ? await db.workspace.findUnique({ where: { id: workspace } }) : null
  await audit({
    organizationId: ws?.organizationId ?? '',
    workspaceId: ws?.id ?? null,
    actorType: 'user',
    actorName,
    action: `security.suspend_${resourceType}`,
    resourceType,
    resourceId,
    severity: 'critical',
    detail: { reason },
  })
}
