import { FixedClock, type IdGenerator } from '@social-monitor/shared-kernel';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { InMemoryScanLeaseAdapter } from '@social-monitor/ingestion/adapters/lease/in-memory-scan-lease.adapter';
import { InMemoryScanAttemptRepository } from '@social-monitor/ingestion/adapters/persistence/in-memory-scan-attempt.repository';
import { InMemoryScanCursorRepository } from '@social-monitor/ingestion/adapters/persistence/in-memory-scan-cursor.repository';
import { InMemorySourceItemRepository } from '@social-monitor/ingestion/adapters/persistence/in-memory-source-item.repository';
import { InMemoryScanFailureQueueAdapter } from '@social-monitor/ingestion/adapters/queue/in-memory-scan-failure-queue.adapter';
import { writeTelegramCursor } from '@social-monitor/ingestion/adapters/source/telegram/telegram-preview-cursor';
import { ExecuteScanUseCase } from '@social-monitor/ingestion/features/execute-scan/execute-scan.use-case';
import { InMemoryScanJobRepository } from '@social-monitor/monitoring/adapters/persistence/in-memory-scan-job.repository';
import type { FetchSourceItemsCommand, FetchSourceItemsResult } from '@social-monitor/ingestion/ports';
import { ProductionCollectionScanJobReporter } from './production-collection-scan-job-reporter';
import { telegramCollectionScope } from './telegram-channel-collection-contract';
import { collectTelegramChannel, summarizeTelegramCollectionCursor } from './telegram-channel-collection-scan';

const now = new Date('2026-10-18T12:00:00Z');
const target = { sourceBindingId: 'binding-a', scanPolicyId: 'policy-a', interestQuery: 'Synthetic private interest text' };
const priorCursor = writeTelegramCursor({ version: 1, channel: 'hiaimediaen', scope: 'live', lastId: 20,
  pending: { beforeId: 29, ceilingId: 30, floorId: 20, fromTime: 1, untilTime: 100 } });

describe('standalone Telegram live collection', () => {
  it('reuses the live cursor, commits incomplete progress, and persists completeness through the production reporter', async () => {
    let count = 0;
    const ids: IdGenerator = { generate: () => `synthetic-${++count}` };
    const clock = new FixedClock(now);
    const scanCursors = new InMemoryScanCursorRepository();
    const scanJobs = new InMemoryScanJobRepository();
    const reporter = new ProductionCollectionScanJobReporter(scanJobs, ids, clock);
    const nextCursor = writeTelegramCursor({ version: 1, channel: 'hiaimediaen', scope: 'live', lastId: 20,
      pending: { beforeId: 25, ceilingId: 30, floorId: 20, fromTime: 1, untilTime: 100 } });
    await scanCursors.save({ ...telegramCollectionScope, sourceBindingId: target.sourceBindingId, cursor: priorCursor, committedAt: now });
    const fetch = jest.fn(async (_command: FetchSourceItemsCommand): Promise<FetchSourceItemsResult> => {
      void _command;
      return {
        items: [], nextCursor, warnings: ['telegram.collection_incomplete:max_pages'],
        telemetry: { collectionComplete: false, backfillPending: true, targetItemCount: 50, collectedItemCount: 0,
          acceptedItemCount: 0, outsideWindowItemCount: 0, pageCount: 5, paginationDuplicateItemCount: 0,
          paginationStopReason: 'max_pages', rateLimitEventCount: 0 },
      };
    });
    const executeScan = new ExecuteScanUseCase({ fetch }, new InMemorySourceItemRepository(), {
      project: async () => ({ projected: 0, projectedItems: [] }),
    }, new InMemoryScanAttemptRepository(), scanCursors, reporter,
    new InMemoryScanFailureQueueAdapter(new InMemoryMetricsRecorder()), new InMemoryScanLeaseAdapter(), ids, clock);
    const execute = jest.spyOn(executeScan, 'execute');
    const result = await collectTelegramChannel(target, { executeScan, execution: {
      scanCursors, reporter, scanJobIdForAttempt: (scope) => reporter.beginAttempt(scope),
      correlationId: 'synthetic-correlation', causationId: 'synthetic-causation',
    } });
    expect(fetch.mock.calls[0]?.[0]).toMatchObject({ tenantId: telegramCollectionScope.tenantId,
      workspaceId: telegramCollectionScope.workspaceId, sourceBindingId: target.sourceBindingId,
      providerKey: 'telegram', cursor: priorCursor, sourceQuery: { mode: 'account_feed', query: 'hiaimediaen' } });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ ...telegramCollectionScope,
      sourceBindingId: target.sourceBindingId, scanPolicyId: target.scanPolicyId }));
    expect(fetch.mock.calls[0]?.[0].sourceQuery.parameters).toBeUndefined();
    expect(result).toMatchObject({ status: 'partial', complete: false, backfillPending: true,
      cursorBefore: { lastId: 20, beforeId: 29 }, cursorAfter: { lastId: 20, beforeId: 25 }, pageCount: 5 });
    expect((await scanCursors.findBySourceBinding({ ...telegramCollectionScope, sourceBindingId: target.sourceBindingId }))?.cursor).toBe(nextCursor);
    expect((await scanJobs.findById({ ...telegramCollectionScope, scanJobId: result.scanJobId }))?.toSnapshot()).toMatchObject({
      sourceBindingId: target.sourceBindingId, scanPolicyId: target.scanPolicyId, status: 'succeeded',
      executionMetadata: { collectionComplete: false, backfillPending: true, pageCount: 5 },
    });
    expect(JSON.stringify(result)).not.toContain(target.interestQuery);
    expect(JSON.stringify(result)).not.toContain('telegram.collection_incomplete');
  });
  it('refuses historical or other-channel cursor identities before starting a new scan', () => {
    expect(() => summarizeTelegramCollectionCursor(writeTelegramCursor({ version: 1, channel: 'hiaimediaen', scope: '1/100', lastId: 20 }))).toThrow('binding_conflict');
    expect(() => summarizeTelegramCollectionCursor(writeTelegramCursor({ version: 1, channel: 'other_channel', scope: 'live', lastId: 20 }))).toThrow('binding_conflict');
    expect(() => summarizeTelegramCollectionCursor('invalid-cursor')).toThrow('binding_conflict');
  });
});
