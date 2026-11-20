import { AsyncLocalStorage } from 'node:async_hooks'
import type { Prisma } from '@prisma/client'

/**
 * Identity claims that PostgreSQL RLS policies may trust for the duration of a
 * single transaction. Values are only set after validating the signed session
 * and membership in the application layer.
 */
export interface DatabaseContext {
  userId?: string
  workspaceId?: string
  organizationId?: string
  transactionClient?: Prisma.TransactionClient
}

const storage = new AsyncLocalStorage<DatabaseContext>()

/**
 * Keep the context active until the callback's returned promise settles.
 * Prisma queries are lazy PrismaPromises: they execute on await, not when the
 * model method is called, so a synchronous wrapper would lose the context.
 */
export async function runWithDatabaseContext<T>(
  context: DatabaseContext,
  callback: () => T | Promise<T>,
): Promise<T> {
  return storage.run({ ...context }, async () => await callback())
}

export function getDatabaseContext(): DatabaseContext | undefined {
  return storage.getStore()
}

/**
 * Add validated identity claims to the current request/job context. The
 * fallback `enterWith` supports entry points that do not use the wrapper;
 * API requests should be wrapped in runWithDatabaseContext for isolation.
 */
export function setDatabaseContext(update: Omit<DatabaseContext, 'transactionClient'>): void {
  const current = storage.getStore()
  if (current) {
    Object.assign(current, update)
    return
  }
  storage.enterWith({ ...update })
}
