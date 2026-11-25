import assert from 'node:assert/strict';

import { PrismaMonitoringConnection } from '@social-monitor/monitoring/adapters/persistence/prisma/prisma-monitoring-connection';
import { PrismaScanJobRepository } from '@social-monitor/monitoring/adapters/persistence/prisma/prisma-scan-job.repository';
import { ScanJob } from '@social-monitor/monitoring/domain';
import { RecordScanExecutionUseCase } from '@social-monitor/monitoring/features/record-scan-execution/record-scan-execution.use-case';
import { runWithTenantDatabaseAccess, type PostgresRuntimePoolConfig } from '@social-monitor/platform-persistence';
import { workspaceId, type IdGenerator, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';

export async function assertScanTerminalOutcomeContention(config: PostgresRuntimePoolConfig,
  scope: { tenantId: TenantId; workspaceId: WorkspaceId }, ids: IdGenerator): Promise<void> {
  const connection = await PrismaMonitoringConnection.create(config);
  const jobs = new PrismaScanJobRepository(connection);
  try {
    for (const matching of [false, true]) {
      const job = ScanJob.request({ ...scope, id: ids.generate(), sourceBindingId: ids.generate(),
        scanPolicyId: ids.generate(), idempotencyKey: ids.generate(),
        requestedAt: new Date('2026-10-30T12:00:00Z'),
      }).markEnqueued({ enqueuedAt: new Date('2026-10-30T12:00:01Z') });
      await runWithTenantDatabaseAccess(scope, () => jobs.save(job));
      let reads = 0;
      let unblock!: () => void;
      const barrier = new Promise<void>((resolve) => { unblock = resolve; });
      const useCase = new RecordScanExecutionUseCase({
        saveTerminalOutcome: (outcome) => jobs.saveTerminalOutcome(outcome),
        findById: async (query) => {
          const entity = await jobs.findById(query);
          if (++reads <= 2) {
            if (reads === 2) unblock();
            await barrier;
          }
          return entity;
        },
      });
      const command = { ...scope, scanJobId: job.toSnapshot().id, completedAt: new Date('2026-10-30T12:00:02Z') };
      const results = await Promise.all([
        runWithTenantDatabaseAccess(scope, () => useCase.execute({ ...command, status: 'succeeded' })),
        runWithTenantDatabaseAccess(scope, () => useCase.execute(matching
          ? { ...command, status: 'succeeded' }
          : { ...command, status: 'failed', failureReason: 'Stale concurrent worker' })),
      ]);
      assert.equal(results.filter((result) => result.ok).length, matching ? 2 : 1,
        'Matching reports must replay safely; conflicting reports must elect one winner');
      if (!matching) assert(results.some((result) => !result.ok && result.error instanceof Error &&
        'code' in result.error && result.error.code === 'operation.conflict'));
      const winner = await runWithTenantDatabaseAccess(scope, () => jobs.findById(command));
      assert(winner);
      const snapshot = winner.toSnapshot();
      assert(['succeeded', 'failed'].includes(snapshot.status));
      const foreignScope = { ...scope, workspaceId: workspaceId(ids.generate()) };
      const wrongWorkspace = ScanJob.rehydrate({ ...snapshot, workspaceId: foreignScope.workspaceId });
      assert.equal(await runWithTenantDatabaseAccess(foreignScope, () => jobs.saveTerminalOutcome(wrongWorkspace)), false,
        'Terminal compare-and-set must include workspace scope');
    }
  } finally {
    await connection.close();
  }
}
