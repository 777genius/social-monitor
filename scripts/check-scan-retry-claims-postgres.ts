import assert from 'node:assert/strict';

import { PrismaIngestionConnection } from '@social-monitor/ingestion/adapters/persistence/prisma/prisma-ingestion-connection';
import { PrismaScanFailureQueueAdapter } from '@social-monitor/ingestion/adapters/persistence/prisma/prisma-scan-failure-queue.adapter';
import type { PrismaIngestionClient } from '@social-monitor/ingestion/adapters/persistence/prisma/prisma-ingestion-client';
import type { RetryScanCommand } from '@social-monitor/ingestion/ports';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { resolvePostgresRuntimePoolConfig, runWithTenantDatabaseAccess } from '@social-monitor/platform-persistence';
import { CryptoIdGenerator, redactSensitiveText, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { assertScanTerminalOutcomeContention } from './support/scan-terminal-outcome-postgres';
import { PrismaScanAttemptRepository } from '@social-monitor/ingestion/adapters/persistence/prisma/prisma-scan-attempt.repository';
import { ScanAttempt } from '@social-monitor/ingestion/domain';

async function main(): Promise<void> {
  const url = process.env.SCAN_RETRY_TEST_DATABASE_URL;
  assert(url, 'SCAN_RETRY_TEST_DATABASE_URL must point to an isolated migrated test database');
  assert.match(decodeURIComponent(new URL(url).pathname.slice(1)), /^architecture_reliability_test_[a-z0-9_]+$/u);
  const ids = new CryptoIdGenerator();
  const scope = { tenantId: tenantId(ids.generate()), workspaceId: workspaceId(ids.generate()) };
  const otherScope = { tenantId: tenantId(ids.generate()), workspaceId: workspaceId(ids.generate()) };
  const config = resolvePostgresRuntimePoolConfig({
    DATABASE_URL: url, POSTGRES_RUNTIME_PROCESS: 'ingestion-worker',
    POSTGRES_RUNTIME_POOL_MIN: '0', POSTGRES_RUNTIME_POOL_MAX: '2',
  });
  const connection = await PrismaIngestionConnection.create(config);
  const queue = new PrismaScanFailureQueueAdapter(connection, new InMemoryMetricsRecorder(), ids);
  const command: RetryScanCommand = {
    ...scope, scanJobId: ids.generate(), interestId: ids.generate(), sourceBindingId: ids.generate(),
    scanPolicyId: ids.generate(), providerKey: 'fake-source',
    sourceQuery: { mode: 'search', query: 'isolated retry ownership fixture' },
    correlationId: ids.generate(), causationId: ids.generate(), attemptNumber: 1,
    nextAttemptNumber: 2, retryBudget: 3, failureReason: 'Fixture provider unavailable',
  };
  const claimAt = (milliseconds: number) => ({
    limit: 1, now: new Date(milliseconds), visibilityTimeoutSeconds: 300,
  });
  try {
    await runWithTenantDatabaseAccess(scope, () => queue.enqueueRetry(command));
    await runWithTenantDatabaseAccess(scope, () => queue.enqueueRetry(command));

    // Force both consumers to read the same pending row before either claims it.
    let reads = 0;
    let unblock!: () => void;
    const barrier = new Promise<void>((resolve) => { unblock = resolve; });
    const delegate = connection.scanFailureQueueEntry;
    const contended: Pick<PrismaIngestionClient, 'scanFailureQueueEntry'> = {
      scanFailureQueueEntry: {
        create: (query) => delegate.create(query),
        updateMany: (query) => delegate.updateMany(query),
        deleteMany: (query) => delegate.deleteMany(query),
        count: (query) => delegate.count(query),
        findMany: async (query) => {
          const records = await delegate.findMany(query);
          if (++reads === 2) unblock();
          await barrier;
          return records;
        },
      },
    };
    const competitor = new PrismaScanFailureQueueAdapter(contended, new InMemoryMetricsRecorder(), ids);
    const [left, right] = await Promise.all([
      competitor.claimRetries(claimAt(0)), competitor.claimRetries(claimAt(0)),
    ]);
    assert.equal(left.length + right.length, 1, 'Atomic database claim must elect one owner');
    const oldOwner = [...left, ...right][0]!;
    assert.equal((await queue.claimRetries(claimAt(1))).length, 0, 'Unacknowledged row remains claimed');
    assert.equal(await oldOwner.renew(new Date(240_000)), true);
    assert.equal((await queue.claimRetries(claimAt(300_001))).length, 0, 'Renewal must extend ownership');

    // A replacement adapter models restart; ownership lives in PostgreSQL, not process memory.
    const restarted = new PrismaScanFailureQueueAdapter(connection, new InMemoryMetricsRecorder(), ids);
    const recovered = (await restarted.claimRetries(claimAt(540_000)))[0]!;
    assert(recovered, 'Expired claim must become available after restart');
    assert.equal(await oldOwner.renew(new Date(540_001)), false);
    await oldOwner.ack();
    await oldOwner.nack({ requeue: false });
    assert.equal((await queue.claimRetries(claimAt(540_002))).length, 0, 'Stale settlement must not mutate replacement ownership');
    await recovered.nack({ requeue: true });
    const released = (await queue.claimRetries(claimAt(540_003)))[0]!;
    assert(released, 'Shutdown release must preserve pending retry work');
    await released.nack({ requeue: false });
    const deadLetters = await runWithTenantDatabaseAccess(scope, () => queue.listDeadLetters({ ...scope, limit: 5 }));
    assert.equal(deadLetters.length, 1);
    assert.equal(deadLetters[0]!.scanJobId, command.scanJobId);
    assert.equal((await runWithTenantDatabaseAccess(otherScope, () => queue.listDeadLetters({ ...otherScope, limit: 5 }))).length, 0);

    await runWithTenantDatabaseAccess(scope, () => queue.enqueueRetry({ ...command, scanJobId: ids.generate() }));
    const acknowledged = (await queue.claimRetries(claimAt(600_000)))[0]!;
    await acknowledged.ack();
    assert.equal((await queue.claimRetries(claimAt(900_001))).length, 0, 'Acknowledged work must stay removed');
    await assertScanTerminalOutcomeContention(config, scope, ids);
    const attempts = new PrismaScanAttemptRepository(connection);
    await runWithTenantDatabaseAccess(scope, () => attempts.save(ScanAttempt.start({
      ...scope, scanJobId: command.scanJobId, sourceBindingId: command.sourceBindingId,
      attemptNumber: 1, startedAt: new Date(0),
    }).fail({ finishedAt: new Date(1000), failureReason: 'Terminal fixture failure', terminalFailure: true })));
    assert.equal((await runWithTenantDatabaseAccess(scope, () => attempts.findByScanJob(command)))?.toSnapshot().terminalFailure, true);
    console.log('Scan retry and terminal outcome PostgreSQL claim, contention, renewal, expiry, fencing, shutdown release, scope and acknowledgement checks passed.');
  } finally {
    await runWithTenantDatabaseAccess(scope, () => connection.scanFailureQueueEntry.deleteMany({ where: scope }));
    await runWithTenantDatabaseAccess(scope, () => connection.$queryRaw`
      DELETE FROM scan_jobs WHERE tenant_id = ${scope.tenantId}::uuid AND workspace_id = ${scope.workspaceId}::uuid RETURNING id`);
    await runWithTenantDatabaseAccess(scope, () => connection.$queryRaw`
      DELETE FROM scan_attempts WHERE tenant_id = ${scope.tenantId}::uuid AND workspace_id = ${scope.workspaceId}::uuid RETURNING scan_job_id`);
    await connection.close();
  }
}

void main().catch((error: unknown) => {
  console.error(redactSensitiveText(error instanceof Error ? error.message : 'Scan retry PostgreSQL check failed'));
  process.exitCode = 1;
});
