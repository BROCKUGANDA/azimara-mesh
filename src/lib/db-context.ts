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

export function runWithDatabaseContext<T>(
  context: DatabaseContext,
  callback: () => T,
): T {
  return storage.run({ ...context }, callback)
}

export function getDatabaseContext(): DatabaseContext | undefined {
  return storage.getStore()
}

/**
 * Add validated identity claims to the current request/job context. The
 * fallback `enterWith` supports server entry points that do not use withApi;
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
