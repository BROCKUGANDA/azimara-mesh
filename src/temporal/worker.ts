// Temporal worker entrypoint. Run with: bun src/temporal/worker.ts
// Requires a Temporal server (see deploy/services/compose.yaml). This worker
// is optional: the default deployment uses the in-process runner.
import { Worker } from '@temporalio/worker'
import * as activities from './activities'
import { AGENT_RUN_TASK_QUEUE } from './shared'

async function run() {
  const worker = await Worker.create({
    workflowsPath: require.resolve('./workflows'),
    activities,
    taskQueue: AGENT_RUN_TASK_QUEUE,
    maxConcurrentActivityTaskExecutions: Number(process.env.TEMPORAL_MAX_ACTIVITIES ?? 8),
    maxCachedWorkflows: 100,
  })
  await worker.run()
}

run().catch((err) => {
  console.error('[temporal-worker] failed', err)
  process.exit(1)
})
