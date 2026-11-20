/**
 * One-way SQLite -> PostgreSQL data migration. Run manually against a
 * DISPOSABLE target database after `prisma migrate deploy`. It never deletes
 * source data and reports counts for manual verification. Do not treat a
 * successful run as cutover evidence until the counts/aggregates are checked
 * and a restore drill has passed.
 *
 * Usage:
 *   SQLITE_PATH=db/custom.db DATABASE_MIGRATION_URL=postgres://... \
 *     bun scripts/migrate-sqlite-to-postgres.ts
 */
import { Database } from 'bun:sqlite'
import { migrationDb } from '../src/lib/db'

const SQLITE_PATH = process.env.SQLITE_PATH ?? 'db/custom.db'
const BATCH_SIZE = 200

const dateFields = new Set([
  'createdAt', 'updatedAt', 'startedAt', 'finishedAt', 'decidedAt', 'expiresAt',
  'openedAt', 'resolvedAt', 'lastActiveAt', 'lastCheckedAt', 'lastSyncAt',
  'lastUsedAt', 'publishedAt', 'nextRunAt', 'ttlAt', 'endedAt', 'recordedAt',
  'currentPeriodStart', 'currentPeriodEnd', 'periodStart', 'periodEnd',
])

const booleanFields = new Set([
  'mfaEnabled', 'isDemo', 'autoPromote', 'requiresApproval', 'byok',
  'requiresApproval', 'isReplay',
])

// Parent-first order so foreign keys are satisfied.
const tables = [
  'Organization', 'Workspace', 'User', 'Membership', 'ServiceIdentity',
  'ApiKey', 'Environment', 'Plan', 'Subscription', 'ModelProvider', 'Model',
  'ModelConnection', 'PromptTemplate', 'Fleet', 'Agent', 'AgentVersion',
  'Workflow', 'Schedule', 'Tool', 'MemoryNamespace', 'MemoryRecord', 'Policy',
  'PolicyDecision', 'Approval', 'Deployment', 'Execution', 'ExecutionStep',
  'AgentMessage', 'ToolCall', 'Integration', 'SecurityIncident', 'EvalDataset',
  'EvalCase', 'EvalRun', 'EvalResult', 'UsageEvent', 'Invoice', 'Notification',
  'AuditEvent', 'FleetAgent',
] as const

function normalize(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (value === undefined) continue
    if (dateFields.has(key) && typeof value === 'number') {
      out[key] = new Date(value)
    } else if (booleanFields.has(key) && (value === 0 || value === 1)) {
      out[key] = value === 1
    } else {
      out[key] = value
    }
  }
  return out
}

async function main() {
  if (!/^postgres/i.test(process.env.DATABASE_MIGRATION_URL ?? '')) {
    throw new Error('DATABASE_MIGRATION_URL must be a PostgreSQL URL')
  }
  const sqlite = new Database(SQLITE_PATH, { readonly: true })
  const report: { table: string; source: number; target: number }[] = []

  for (const table of tables) {
    let sourceRows: Record<string, unknown>[]
    try {
      sourceRows = sqlite.query(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[]
    } catch {
      console.warn(`skip ${table}: not present in source`)
      continue
    }
    const delegateName = table[0].toLowerCase() + table.slice(1)
    const delegate = (migrationDb as unknown as Record<string, {
      count: () => Promise<number>
      createMany: (args: { data: Record<string, unknown>[]; skipDuplicates: boolean }) => Promise<unknown>
    }>)[delegateName]
    if (!delegate) {
      console.warn(`skip ${table}: no Prisma delegate`)
      continue
    }

    for (let i = 0; i < sourceRows.length; i += BATCH_SIZE) {
      const batch = sourceRows.slice(i, i + BATCH_SIZE).map((row) => normalize(table, row))
      await delegate.createMany({ data: batch, skipDuplicates: true })
    }
    const targetCount = await delegate.count()
    report.push({ table, source: sourceRows.length, target: targetCount })
    console.log(`${table}: source=${sourceRows.length} target=${targetCount}`)
  }

  sqlite.close()
  const mismatches = report.filter((r) => r.source !== r.target)
  if (mismatches.length) {
    console.error('COUNT MISMATCHES:', mismatches)
    process.exitCode = 1
  } else {
    console.log('All table counts match. Verify aggregates and run a restore drill before cutover.')
  }
  await migrationDb.$disconnect()
}

main().catch(async (error) => {
  console.error(error)
  await migrationDb.$disconnect()
  process.exit(1)
})
