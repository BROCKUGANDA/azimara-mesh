import { PrismaClient, Prisma } from '@prisma/client'
import type { Prisma as PrismaTypes } from '@prisma/client'
import { getDatabaseContext, runWithDatabaseContext } from '@/lib/db-context'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const basePrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['warn', 'error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = basePrisma

function usesPostgres(): boolean {
  return /^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL ?? '')
}

type TransactionOptions = {
  isolationLevel?: PrismaTypes.TransactionIsolationLevel
  maxWait?: number
  timeout?: number
}

type ClaimValues = {
  userId: string
  workspaceId: string
  organizationId: string
}

function claimValues(): ClaimValues {
  const context = getDatabaseContext() ?? {}
  return {
    userId: context.userId ?? '',
    workspaceId: context.workspaceId ?? '',
    organizationId: context.organizationId ?? '',
  }
}

function setClaimsOn(tx: PrismaTypes.TransactionClient) {
  const values = claimValues()
  return tx.$executeRaw`SELECT
    set_config('app.user_id', ${values.userId}, true),
    set_config('app.workspace_id', ${values.workspaceId}, true),
    set_config('app.organization_id', ${values.organizationId}, true)`
}

function claimStatement() {
  const values = claimValues()
  return basePrisma.$executeRaw`SELECT
    set_config('app.user_id', ${values.userId}, true),
    set_config('app.workspace_id', ${values.workspaceId}, true),
    set_config('app.organization_id', ${values.organizationId}, true)`
}

/**
 * Wrap each tenant-data model query in a batch transaction: claim-setting SQL
 * first, the original query second. Both share one connection, so RLS policies
 * see the validated claims. Identity/bootstrap tables are not RLS protected;
 * the application auth layer guards them. Inert for SQLite.
 */
const rlsExtension = Prisma.defineExtension((client) =>
  client.$extends({
    query: {
      async $allOperations({ model, args, query }) {
        const context = getDatabaseContext()
        if (!usesPostgres() || !context || !model) return query(args)
        if (context.transactionClient) return query(args)
        const [result] = (await basePrisma.$transaction([
          claimStatement(),
          query(args),
        ])) as unknown[]
        return result
      },
    },
  }),
)

const client = usesPostgres() ? basePrisma.$extends(rlsExtension) : basePrisma

/** Interactive transactions set claims once on their connection. */
function scopedTransaction<T>(
  callback: (tx: PrismaTypes.TransactionClient) => Promise<T>,
  options?: TransactionOptions,
): Promise<T> {
  if (getDatabaseContext()?.transactionClient) {
    throw new Error('Nested interactive transactions are not supported')
  }
  return basePrisma.$transaction(async (tx) => {
    if (usesPostgres()) await setClaimsOn(tx)
    return runWithDatabaseContext(
      { ...(getDatabaseContext() ?? {}), transactionClient: tx },
      () => callback(tx),
    )
  }, options)
}

export const db = Object.assign(client, {
  $transaction: scopedTransaction,
}) as PrismaClient

/** Migration/maintenance only. Never use in request or execution workers. */
export { basePrisma as adminDb }

/** Uses DATABASE_MIGRATION_URL (table owner). Never import in app code. */
export const migrationDb = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL ?? '' },
  },
  log: ['warn', 'error'],
})
