/**
 * Idempotent demo-data seeder for an existing workspace.
 *
 * Unlike prisma/seed.ts this never wipes tables. Every row has a deterministic
 * `demo_` id or slug and is upserted, so re-running refreshes the demo instead
 * of duplicating it. All user-facing copy is labelled as demo data.
 *
 * Usage:
 *   DEMO_WORKSPACE_ID=<id> DATABASE_MIGRATION_URL=postgres://... \
 *     bun prisma/seed-demo-data.ts
 */
import { migrationDb as db } from '../src/lib/db'

const workspaceId = process.env.DEMO_WORKSPACE_ID ?? ''
if (!workspaceId) throw new Error('DEMO_WORKSPACE_ID is required')

const workspace = await db.workspace.findUnique({ where: { id: workspaceId } })
if (!workspace) throw new Error('Demo workspace not found')
const orgId = workspace.organizationId

const owner = await db.user.findFirst({ where: { email: 'admin@mesh.aiazimara.com' } })
if (!owner) throw new Error('Demo owner user not found')

const DAY = 86_400_000
const now = Date.now()
const ago = (days: number, hours = 0) => new Date(now - days * DAY - hours * 3_600_000)
const ahead = (days: number) => new Date(now + days * DAY)
const DEMO = 'Demo · seeded'

// ---------- model catalogue ----------
const provider = await db.modelProvider.upsert({
  where: { id: 'demo_provider_runtime' },
  create: { id: 'demo_provider_runtime', name: 'Azimara Runtime (demo)', slug: 'demo-azimara-runtime', kind: 'internal', status: 'healthy', latencyMs: 240, errorRate: 0.004 },
  update: { status: 'healthy', latencyMs: 240, errorRate: 0.004 },
})
const secondProvider = await db.modelProvider.upsert({
  where: { id: 'demo_provider_fallback' },
  create: { id: 'demo_provider_fallback', name: 'Demo Fallback Provider', slug: 'demo-fallback-provider', kind: 'api', status: 'degraded', latencyMs: 780, errorRate: 0.031 },
  update: { status: 'degraded', latencyMs: 780, errorRate: 0.031 },
})
const models = [
  { id: 'demo_model_core', name: 'Azimara Core 1 (demo)', modelId: 'demo-azimara-core-1', cost: 0.25 },
  { id: 'demo_model_mini', name: 'Azimara Mini (demo)', modelId: 'demo-azimara-mini', cost: 0.08 },
  { id: 'demo_model_fallback', name: 'Fallback Model (demo)', modelId: 'demo-fallback', cost: 0.2 },
]
for (const [i, m] of models.entries()) {
  await db.model.upsert({
    where: { id: m.id },
    create: {
      id: m.id, providerId: i === 2 ? secondProvider.id : provider.id,
      name: m.name, modelId: m.modelId, contextWindow: 32000,
      inputCostPerMtok: m.cost, outputCostPerMtok: m.cost * 3,
      capabilitiesJson: JSON.stringify(['chat', 'tools', 'structured', 'streaming']),
      taskClassesJson: JSON.stringify(['research', 'triage', 'analysis', 'monitoring']),
      maxOutputTokens: 2048, status: 'available',
    },
    update: { status: 'available' },
  })
}
await db.modelConnection.upsert({
  where: { id: 'demo_model_connection' },
  create: { id: 'demo_model_connection', workspaceId, providerId: provider.id, name: `${DEMO} managed runtime`, authMode: 'platform', status: 'connected', lastCheckedAt: ago(0, 1) },
  update: { status: 'connected', lastCheckedAt: ago(0, 1) },
})

// ---------- tools ----------
const toolDefs = [
  { id: 'demo_tool_search', slug: 'demo-web-search', name: 'Web Search (demo)', kind: 'http', risk: 'medium', approval: false, calls: 412, errors: 6 },
  { id: 'demo_tool_crm', slug: 'demo-crm-lookup', name: 'CRM Lookup (demo)', kind: 'http', risk: 'medium', approval: false, calls: 288, errors: 3 },
  { id: 'demo_tool_sql', slug: 'demo-sql-query', name: 'Analytics SQL (demo)', kind: 'database', risk: 'high', approval: false, calls: 176, errors: 9 },
  { id: 'demo_tool_refund', slug: 'demo-payment-refund', name: 'Payment Refund (demo)', kind: 'http', risk: 'critical', approval: true, calls: 31, errors: 1 },
  { id: 'demo_tool_slack', slug: 'demo-slack-post', name: 'Slack Notify (demo)', kind: 'webhook', risk: 'low', approval: false, calls: 522, errors: 2 },
  { id: 'demo_tool_kb', slug: 'demo-kb-search', name: 'Knowledge Base (demo)', kind: 'mcp', risk: 'low', approval: false, calls: 349, errors: 0 },
]
for (const t of toolDefs) {
  await db.tool.upsert({
    where: { id: t.id },
    create: {
      id: t.id, workspaceId, name: t.name, slug: t.slug, kind: t.kind, version: '1.0.0',
      description: `${DEMO} — ${t.name}`, provider: 'Demo Provider',
      inputSchemaJson: JSON.stringify({ type: 'object', properties: { query: { type: 'string' } } }),
      outputSchemaJson: JSON.stringify({ type: 'object' }), authMethod: 'service_identity',
      secretRef: 'vault://demo/tools/' + t.slug, riskClass: t.risk, dataClass: 'internal',
      rateLimitPerMin: 60, timeoutMs: 8000, requiresApproval: t.approval, status: 'healthy',
      ownerName: 'Mesh Administrator', callCount: t.calls, errorCount: t.errors,
    },
    update: { callCount: t.calls, errorCount: t.errors, status: 'healthy' },
  })
}

// ---------- memory ----------
const nsDefs = [
  { id: 'demo_ns_research', slug: 'demo-research-knowledge', name: 'Research Knowledge (demo)', kind: 'semantic' },
  { id: 'demo_ns_ops', slug: 'demo-ops-runbooks', name: 'Ops Runbooks (demo)', kind: 'semantic' },
  { id: 'demo_ns_incidents', slug: 'demo-incident-notes', name: 'Incident Notes (demo)', kind: 'episodic' },
]
for (const n of nsDefs) {
  await db.memoryNamespace.upsert({
    where: { id: n.id },
    create: { id: n.id, workspaceId, name: n.name, slug: n.slug, kind: n.kind, classification: 'internal', retentionDays: 180, allowedRolesJson: JSON.stringify(['owner', 'admin', 'operator']), description: `${DEMO} namespace` },
    update: { recordCount: 2, indexStatus: 'indexed' },
  })
}
const memoryRows = [
  ['demo_mem_1', 'demo_ns_research', 'Demo research note: deterministic policy enforcement is the differentiator agents trust.'],
  ['demo_mem_2', 'demo_ns_research', 'Demo buyer guidance: tenant-isolation evidence is required before production adoption.'],
  ['demo_mem_3', 'demo_ns_ops', 'Demo runbook: failover chain runtime → fallback; pause non-critical fleets after 3 failures.'],
  ['demo_mem_4', 'demo_ns_ops', 'Demo escalation: page on-call when spend exceeds 90% of cap.'],
  ['demo_mem_5', 'demo_ns_incidents', 'Demo INC-1188: prompt-injection attempt in tool output; sanitizer blocked exfiltration.'],
  ['demo_mem_6', 'demo_ns_incidents', 'Demo INC-1201: replay suppressed a duplicate refund; side effects stayed at-least-once.'],
]
for (const [id, namespaceId, content] of memoryRows) {
  await db.memoryRecord.upsert({
    where: { id },
    create: { id, namespaceId, content: `${DEMO} — ${content}`, classification: 'internal', provenance: 'manual', score: 0.9, createdAt: ago(4) },
    update: { content: `${DEMO} — ${content}` },
  })
}

// ---------- fleets & agents ----------
const fleetDefs = [
  { id: 'demo_fleet_ops', name: 'Customer Operations (demo)', dept: 'Support & Success', budget: 150, concurrency: 8 },
  { id: 'demo_fleet_eng', name: 'Engineering (demo)', dept: 'Engineering', budget: 100, concurrency: 6 },
  { id: 'demo_fleet_rel', name: 'Reliability (demo)', dept: 'Platform SRE', budget: 60, concurrency: 4 },
]
for (const f of fleetDefs) {
  await db.fleet.upsert({
    where: { id: f.id },
    create: { id: f.id, workspaceId, name: f.name, description: `${DEMO} fleet`, department: f.dept, ownerName: 'Mesh Administrator', monthlyBudget: f.budget, concurrencyCap: f.concurrency, status: 'healthy' },
    update: { status: 'healthy' },
  })
}
const agentDefs = [
  { id: 'demo_agent_triage', slug: 'demo-customer-triage', name: 'Customer Triage (demo)', fleet: 'demo_fleet_ops', autonomy: 'A2', status: 'healthy', version: '2.3.0', success: 0.94, latency: 2100, tools: ['demo_tool_search', 'demo_tool_crm', 'demo_tool_slack'], ns: ['demo_ns_ops'] },
  { id: 'demo_agent_reconciler', slug: 'demo-invoice-reconciler', name: 'Invoice Reconciler (demo)', fleet: 'demo_fleet_ops', autonomy: 'A2', status: 'healthy', version: '1.7.1', success: 0.91, latency: 3400, tools: ['demo_tool_sql', 'demo_tool_refund'], ns: ['demo_ns_research'] },
  { id: 'demo_agent_reviewer', slug: 'demo-code-reviewer', name: 'Code Reviewer (demo)', fleet: 'demo_fleet_eng', autonomy: 'A1', status: 'healthy', version: '3.1.0', success: 0.96, latency: 1800, tools: ['demo_tool_search'], ns: ['demo_ns_ops'] },
  { id: 'demo_agent_researcher', slug: 'demo-research-analyst', name: 'Research Analyst (demo)', fleet: 'demo_fleet_eng', autonomy: 'A1', status: 'healthy', version: '2.0.2', success: 0.92, latency: 4200, tools: ['demo_tool_search', 'demo_tool_kb'], ns: ['demo_ns_research'] },
  { id: 'demo_agent_watchdog', slug: 'demo-ops-watchdog', name: 'Ops Watchdog (demo)', fleet: 'demo_fleet_rel', autonomy: 'A3', status: 'healthy', version: '1.9.0', success: 0.97, latency: 900, tools: ['demo_tool_slack'], ns: ['demo_ns_ops', 'demo_ns_incidents'] },
  { id: 'demo_agent_incident', slug: 'demo-incident-responder', name: 'Incident Responder (demo)', fleet: 'demo_fleet_rel', autonomy: 'A2', status: 'degraded', version: '1.5.3', success: 0.71, latency: 5600, tools: ['demo_tool_slack', 'demo_tool_kb'], ns: ['demo_ns_incidents'] },
]
for (const [i, a] of agentDefs.entries()) {
  await db.agent.upsert({
    where: { id: a.id },
    create: {
      id: a.id, workspaceId, fleetId: a.fleet, name: a.name, slug: a.slug,
      description: `${DEMO} — governed agent for demonstrations`, category: 'customer_ops',
      framework: 'azimara-native', runtimeType: 'managed', status: a.status === 'degraded' ? 'degraded' : 'healthy',
      autonomyLevel: a.autonomy, currentVersion: a.version, ownerName: 'Mesh Administrator',
      modelConfigJson: JSON.stringify({ primary: models[i % 2].id, fallback: [models[2].id], temperature: 0.3, maxTokens: 1024 }),
      toolPermissionsJson: JSON.stringify(a.tools),
      memoryConfigJson: JSON.stringify({ namespaces: a.ns, contextTokens: 4000, ttlDays: 30 }),
      policyRefsJson: JSON.stringify([]),
      resourceLimitsJson: JSON.stringify({ maxSteps: 10, timeoutMs: 90000, maxCostUsd: 1.5, maxDelegationDepth: 2, monthlyBudget: 40, maxIterations: 3 }),
      evalProfileJson: JSON.stringify({ minScore: 0.7, safetyScan: true }),
      inputSchemaJson: JSON.stringify({ type: 'object', required: ['prompt'], properties: { prompt: { type: 'string', maxLength: 500 } } }),
      outputSchemaJson: JSON.stringify({ type: 'object' }),
      systemPrompt: `${DEMO} — You are ${a.name}. Follow policy; never exceed granted tool scopes.`,
      successRate: a.success, avgLatencyMs: a.latency, healthStatus: a.status,
      spendMonth: Number((6 + i * 4.25).toFixed(4)), lastActiveAt: ago(0, i), createdBy: owner.id,
    },
    update: { status: a.status === 'degraded' ? 'degraded' : 'healthy', successRate: a.success, avgLatencyMs: a.latency, healthStatus: a.status, lastActiveAt: ago(0, i) },
  })
  await db.fleetAgent.upsert({
    where: { fleetId_agentId: { fleetId: a.fleet, agentId: a.id } },
    create: { fleetId: a.fleet, agentId: a.id, role: 'member' },
    update: {},
  })
  await db.serviceIdentity.upsert({
    where: { id: `demo_identity_${a.id}` },
    create: { id: `demo_identity_${a.id}`, workspaceId, name: `workload:${a.slug}`, kind: 'workload', agentId: a.id, scopes: JSON.stringify(['tools:invoke', 'memory:read', 'model:invoke']), keyFingerprint: `fp_demo_${a.id.slice(-6)}`, status: 'active' },
    update: { status: 'active' },
  })
  for (const [v, status, score] of [['1.0.0', 'retired', 0.82], [a.version, 'published', 0.9]] as const) {
    await db.agentVersion.upsert({
      where: { agentId_version: { agentId: a.id, version: v } },
      create: { agentId: a.id, version: v, changelog: `${DEMO} version history`, snapshotJson: JSON.stringify({ systemPrompt: `${DEMO} — governed agent`, tools: a.tools, autonomy: a.autonomy }), diffSummaryJson: '[]', evalScore: score, status, publishedAt: ago(v === a.version ? 9 : 30), createdBy: owner.id },
      update: { status, evalScore: score },
    })
  }
}

// ---------- policies ----------
const policyDefs = [
  { id: 'demo_policy_gate', name: 'High-risk tool approval (demo)', slug: 'demo-high-risk-gate', kind: 'approval', effect: 'require_approval', priority: 900, rules: [{ field: 'tool.riskClass', operator: 'in', value: ['high', 'critical'] }] },
  { id: 'demo_policy_provider', name: 'Restricted provider lock (demo)', slug: 'demo-restricted-provider', kind: 'data', effect: 'deny', priority: 1000, rules: [{ field: 'dataClass', operator: 'eq', value: 'restricted' }] },
  { id: 'demo_policy_budget', name: 'Workspace spend cap (demo)', slug: 'demo-spend-cap', kind: 'budget', effect: 'deny', priority: 700, rules: [{ field: 'costUsd', operator: 'gt', value: 500 }] },
]
for (const p of policyDefs) {
  await db.policy.upsert({
    where: { id: p.id },
    create: { id: p.id, workspaceId, name: p.name, slug: p.slug, kind: p.kind, effect: p.effect, priority: p.priority, rulesJson: JSON.stringify(p.rules), appliesToJson: '{}', description: `${DEMO} policy`, status: 'active', createdBy: owner.id },
    update: { status: 'active' },
  })
}

// ---------- workflows ----------
const wfDefs = [
  {
    id: 'demo_wf_triage', slug: 'demo-support-triage', name: 'Support Ticket Triage (demo)', trigger: 'webhook',
    nodes: [
      { key: 'in', type: 'input', label: 'Ticket received', config: {} },
      { key: 'triage', type: 'agent', label: 'Customer Triage', config: { agentId: 'demo_agent_triage' } },
      { key: 'approval', type: 'approval', label: 'Manager approval', config: {} },
      { key: 'out', type: 'output', label: 'Emit result', config: {} },
    ],
    edges: [{ from: 'in', to: 'triage' }, { from: 'triage', to: 'approval' }, { from: 'approval', to: 'out' }],
  },
  {
    id: 'demo_wf_nightly', slug: 'demo-nightly-ops', name: 'Nightly Ops Report (demo)', trigger: 'schedule',
    nodes: [
      { key: 'in', type: 'input', label: 'Nightly trigger', config: {} },
      { key: 'par', type: 'parallel', label: 'Fan-out', config: { children: ['rw', 'ww'] } },
      { key: 'rw', type: 'agent', label: 'Research Analyst', config: { agentId: 'demo_agent_researcher' } },
      { key: 'ww', type: 'agent', label: 'Ops Watchdog', config: { agentId: 'demo_agent_watchdog' } },
      { key: 'out', type: 'output', label: 'Emit digest', config: {} },
    ],
    edges: [{ from: 'in', to: 'par' }, { from: 'par', to: 'rw' }, { from: 'par', to: 'ww' }, { from: 'rw', to: 'out' }, { from: 'ww', to: 'out' }],
  },
]
for (const w of wfDefs) {
  await db.workflow.upsert({
    where: { id: w.id },
    create: {
      id: w.id, workspaceId, name: w.name, slug: w.slug, description: `${DEMO} workflow`,
      version: 1, status: 'published', triggerType: w.trigger, createdBy: owner.id,
      specJson: JSON.stringify({ version: 1, maxIterationsPerNode: 3, budgets: { maxSteps: 24, timeoutMs: 120000, maxCostUsd: 3 }, nodes: w.nodes, edges: w.edges }),
      inputSchemaJson: JSON.stringify({ type: 'object', required: ['prompt'], properties: { prompt: { type: 'string' } } }),
      outputSchemaJson: JSON.stringify({ type: 'object' }),
    },
    update: { status: 'published', version: 1 },
  })
}

// ---------- executions + steps ----------
const execStatuses = ['succeeded', 'succeeded', 'succeeded', 'succeeded', 'failed', 'cancelled', 'waiting_approval', 'succeeded', 'succeeded', 'failed', 'succeeded', 'running', 'succeeded', 'succeeded', 'timed_out', 'succeeded', 'succeeded', 'succeeded']
for (let i = 0; i < execStatuses.length; i++) {
  const id = `demo_exec_${String(i + 1).padStart(2, '0')}`
  const agent = agentDefs[i % agentDefs.length]
  const wf = i % 3 === 0 ? wfDefs[0] : wfDefs[1]
  const status = execStatuses[i]
  const started = ago(Math.floor(i / 3), (i % 6) + 1)
  const finished = ['succeeded', 'failed', 'cancelled', 'timed_out'].includes(status) ? new Date(started.getTime() + 4200 + i * 37) : null
  await db.execution.upsert({
    where: { id },
    create: {
      id, workspaceId, kind: i % 3 === 0 ? 'workflow_run' : 'agent_run',
      agentId: agent.id, workflowId: i % 3 === 0 ? wf.id : null,
      agentVersion: agent.version, workflowVersion: 1, status,
      trigger: i % 4 === 0 ? 'webhook' : 'api', correlationId: `demo_corr_${i}`,
      inputJson: JSON.stringify({ prompt: `${DEMO} research request ${i + 1}` }),
      outputJson: status === 'succeeded' ? JSON.stringify({ text: `${DEMO} completed output`, toolResults: [] }) : null,
      error: status === 'failed' ? `${DEMO} policy denial simulated for demonstration` : null,
      startedAt: started, finishedAt: finished,
      durationMs: finished ? finished.getTime() - started.getTime() : 0,
      tokenIn: 1200 + i * 91, tokenOut: 380 + i * 17,
      costUsd: Number((0.02 + i * 0.004).toFixed(4)), toolCallCount: 1 + (i % 3), retryCount: status === 'failed' ? 1 : 0,
      budgetCapsJson: JSON.stringify({ maxSteps: 10, timeoutMs: 90000, maxCostUsd: 1.5, maxDelegationDepth: 2 }),
      checkpointJson: JSON.stringify({ phase: status === 'waiting_approval' ? 'awaiting_approval' : 'completed' }),
      identitySubject: `demo_identity_${agent.id}`,
    },
    update: { status, finishedAt: finished, durationMs: finished ? finished.getTime() - started.getTime() : 0 },
  })
  const steps = [
    ['context_assembly', 'Assemble execution context', 'succeeded'],
    ['model_request', 'Model request', 'succeeded'],
    ['policy_check', 'Policy check', status === 'failed' ? 'denied' : 'succeeded'],
    ['tool_call', 'Tool call', status === 'failed' ? 'failed' : 'succeeded'],
    ['output', 'Emit output', status === 'succeeded' ? 'succeeded' : 'skipped'],
  ] as const
  for (const [seq, [kind, label, stepStatus]] of steps.entries()) {
    await db.executionStep.upsert({
      where: { executionId_seq: { executionId: id, seq } },
      create: { id: `demo_step_${i}_${seq}`, executionId: id, seq, kind, label, status: stepStatus, detailJson: JSON.stringify({ demo: true }), startedAt: started, endedAt: finished, durationMs: 240 + seq * 60 },
      update: { status: stepStatus },
    })
  }
}

// ---------- evaluations ----------
await db.evalDataset.upsert({
  where: { id: 'demo_dataset_triage' },
  create: { id: 'demo_dataset_triage', workspaceId, name: 'Triage Quality (demo)', slug: 'demo-triage-quality', description: `${DEMO} dataset`, category: 'quality' },
  update: {},
})
for (let i = 1; i <= 4; i++) {
  await db.evalCase.upsert({
    where: { id: `demo_case_${i}` },
    create: { id: `demo_case_${i}`, datasetId: 'demo_dataset_triage', name: `Demo case ${i}`, inputJson: JSON.stringify({ prompt: `Sample ${i}` }), expectedJson: JSON.stringify({ contains: ['classification'] }), evaluator: 'deterministic', weight: 1 },
    update: {},
  })
}
await db.evalRun.upsert({
  where: { id: 'demo_eval_run_1' },
  create: { id: 'demo_eval_run_1', workspaceId, datasetId: 'demo_dataset_triage', agentId: 'demo_agent_triage', agentVersion: '2.3.0', modelId: 'demo_model_core', label: `${DEMO} run`, status: 'completed', passRate: 0.75, avgScore: 0.88, avgLatencyMs: 2100, totalCost: 0.42, startedAt: ago(2), finishedAt: ago(2, -1) },
  update: { status: 'completed', passRate: 0.75, avgScore: 0.88 },
})
for (let i = 1; i <= 4; i++) {
  await db.evalResult.upsert({
    where: { id: `demo_result_${i}` },
    create: { id: `demo_result_${i}`, runId: 'demo_eval_run_1', caseId: `demo_case_${i}`, caseName: `Demo case ${i}`, passed: i !== 4, score: Number((0.96 - i * 0.05).toFixed(2)), checksJson: JSON.stringify([{ check: 'contains', passed: i !== 4, detail: 'demo' }]), outputText: `${DEMO} output`, latencyMs: 1200 + i * 130 },
    update: {},
  })
}

// ---------- usage events ----------
for (let i = 1; i <= 36; i++) {
  const agent = agentDefs[i % agentDefs.length]
  await db.usageEvent.upsert({
    where: { idempotencyKey: `demo_usage_${i}` },
    create: {
      id: `demo_usage_${i}`, workspaceId, kind: i % 4 === 0 ? 'token_out' : 'execution',
      quantity: i % 4 === 0 ? 380 + i * 7 : 1, unitCostUsd: i % 4 === 0 ? 0.000002 : 0.01,
      costUsd: Number((0.02 + (i % 9) * 0.006).toFixed(6)),
      agentId: agent.id, modelId: 'demo_model_core', executionId: `demo_exec_${String((i % 18) + 1).padStart(2, '0')}`,
      idempotencyKey: `demo_usage_${i}`, recordedAt: ago(Math.floor(i / 3), i % 8),
    },
    update: {},
  })
}

// ---------- governance, deployments, notifications ----------
await db.approval.upsert({
  where: { id: 'demo_approval_1' },
  create: { id: 'demo_approval_1', workspaceId, kind: 'tool_usage', title: `${DEMO} refund approval`, detailJson: JSON.stringify({ toolSlug: 'demo-payment-refund', demo: true }), requestedBy: 'workload:demo-invoice-reconciler', riskClass: 'critical', status: 'pending', reviewerRole: 'admin', quorum: 1, expiresAt: ahead(1) },
  update: { status: 'pending' },
})
await db.deployment.upsert({
  where: { id: 'demo_deployment_1' },
  create: { id: 'demo_deployment_1', workspaceId, agentId: 'demo_agent_triage', versionId: '2.3.0', environment: 'staging', strategy: 'canary', canaryPct: 25, status: 'healthy', healthGate: JSON.stringify({ errorRateThreshold: 0.05, latencyP95Ms: 8000, evalGate: 0.7 }), evalScore: 0.9, createdBy: owner.id },
  update: { status: 'healthy' },
})
for (const [id, kind, title, severity] of [
  ['demo_incident_1', 'prompt_injection', `${DEMO} injection attempt blocked`, 'high'],
  ['demo_incident_2', 'cost_anomaly', `${DEMO} cost anomaly observed`, 'medium'],
] as const) {
  await db.securityIncident.upsert({
    where: { id },
    create: { id, workspaceId, kind, title, detailJson: JSON.stringify({ demo: true }), severity, status: 'contained', openedAt: ago(3), resolvedAt: ago(2), resolvedBy: owner.id },
    update: { status: 'contained' },
  })
}
for (let i = 1; i <= 4; i++) {
  await db.notification.upsert({
    where: { id: `demo_notification_${i}` },
    create: { id: `demo_notification_${i}`, workspaceId, kind: i === 1 ? 'approval_request' : 'system', title: `${DEMO} notification ${i}`, body: 'Seeded for the demo workspace', severity: i === 1 ? 'critical' : 'info', linkView: i === 1 ? 'approvals' : 'overview', createdAt: ago(i) },
    update: {},
  })
  await db.auditEvent.upsert({
    where: { id: `demo_audit_${i}` },
    create: { id: `demo_audit_${i}`, organizationId: orgId, workspaceId, actorType: 'agent', actorId: agentDefs[i].id, actorName: agentDefs[i].name, action: `demo.execution.${i}`, resourceType: 'execution', resourceId: `demo_exec_${String(i).padStart(2, '0')}`, severity: 'info', detailJson: JSON.stringify({ demo: true }), createdAt: ago(i) },
    update: {},
  })
  await db.policyDecision.upsert({
    where: { id: `demo_decision_${i}` },
    create: { id: `demo_decision_${i}`, workspaceId, policyName: `${DEMO} policy`, subject: agentDefs[i].id, action: 'tool_invoke', resource: toolDefs[i].id, decision: i === 3 ? 'deny' : 'allow', reason: `${DEMO} deterministic decision`, contextJson: JSON.stringify({ demo: true }), createdAt: ago(i) },
    update: {},
  })
}
await db.agentMessage.upsert({
  where: { id: 'demo_message_1' },
  create: { id: 'demo_message_1', workspaceId, senderId: 'demo_agent_triage', recipientId: 'demo_agent_reviewer', type: 'task', correlationId: 'demo_corr_handoff', payloadJson: JSON.stringify({ demo: true, task: 'Review classification' }), authContextJson: JSON.stringify({ workspaceId }), createdAt: ago(1) },
  update: {},
})
await db.schedule.upsert({
  where: { id: 'demo_schedule_1' },
  create: { id: 'demo_schedule_1', workspaceId, name: `${DEMO} nightly report`, cronExpr: '0 2 * * *', targetKind: 'workflow', targetId: 'demo_wf_nightly', targetName: 'Nightly Ops Report (demo)', timezone: 'UTC', status: 'active', lastRunAt: ago(1), nextRunAt: ahead(1) },
  update: { lastRunAt: ago(1), nextRunAt: ahead(1) },
})
for (const [id, name, category, status] of [
  ['demo_integration_slack', 'Slack (demo)', 'communication', 'connected'],
  ['demo_integration_github', 'GitHub (demo)', 'devops', 'connected'],
  ['demo_integration_snowflake', 'Snowflake (demo)', 'data', 'error'],
] as const) {
  await db.integration.upsert({
    where: { id },
    create: { id, workspaceId, name, category, status, authMethod: 'service_identity', lastSyncAt: ago(1) },
    update: { status },
  })
}

// Clearly-labelled demo credits so the billing rail is explorable.
await db.onchainPayment.upsert({
  where: { signature: 'demo_not_onchain_seed_payment' },
  create: { id: 'demo_payment_1', workspaceId, signature: 'demo_not_onchain_seed_payment', payer: 'demo-payer', amountUsd: 100, tokenAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', network: 'base-mainnet', chainId: 8453, destination: '0x9cb57c0daf38462447509998647eD06488CBeBf8', status: 'confirmed' },
  update: {},
})
await db.creditLedgerEntry.upsert({
  where: { workspaceId_kind_reference: { workspaceId, kind: 'topup', reference: 'demo_not_onchain_seed_payment' } },
  create: { id: 'demo_ledger_1', workspaceId, amountUsd: 100, kind: 'topup', reference: 'demo_not_onchain_seed_payment', balanceAfterUsd: 100 },
  update: {},
})

const counts = {
  agents: await db.agent.count({ where: { workspaceId } }),
  executions: await db.execution.count({ where: { workspaceId } }),
  steps: await db.executionStep.count({ where: { executionId: { startsWith: 'demo_exec_' } } }),
  usage: await db.usageEvent.count({ where: { idempotencyKey: { startsWith: 'demo_usage_' } } }),
  evaluations: await db.evalResult.count({ where: { id: { startsWith: 'demo_result_' } } }),
  audit: await db.auditEvent.count({ where: { id: { startsWith: 'demo_audit_' } } }),
}
console.log('Demo data seeded (idempotent):', counts)
console.log('All demo records are labelled with "Demo · seeded".')
await db.$disconnect()
