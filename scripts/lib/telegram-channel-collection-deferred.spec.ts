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
import { SourceFetchError, type SourceFetcherPort, type ScanExecutionReporterPort } from '@social-monitor/ingestion/ports';
import { ProductionCollectionScanJobReporter } from './production-collection-scan-job-reporter';
import { telegramCollectionScope } from './telegram-channel-collection-contract';
import { observeTelegramCollectionOperation } from './telegram-channel-collection-runtime';
import { collectTelegramChannel } from './telegram-channel-collection-scan';

const now = new Date('2026-10-18T12:00:00Z');
const target = { sourceBindingId: 'binding-a', scanPolicyId: 'policy-a', interestQuery: 'Synthetic private query' };
const initialCursor = writeTelegramCursor({ version: 1, channel: 'hiaimediaen', scope: 'live', lastId: 20,
  pending: { beforeId: 29, ceilingId: 30, floorId: 20, fromTime: 1, untilTime: 100 } });
const movedCursor = writeTelegramCursor({ version: 1, channel: 'hiaimediaen', scope: 'live', lastId: 30 });

const setup = async (options: { fetchReturns?: boolean; failReport?: boolean; changeCursor?: boolean; emptyCursor?: boolean } = {}) => {
  let sequence = 0;
  const ids: IdGenerator = { generate: () => `synthetic-${++sequence}` };
  const clock = new FixedClock(now);
  const scanCursors = new InMemoryScanCursorRepository();
  const cursorScope = { ...telegramCollectionScope, sourceBindingId: target.sourceBindingId };
  if (!options.emptyCursor) await scanCursors.save({ ...cursorScope, cursor: initialCursor, committedAt: now });
  const scanJobs = new InMemoryScanJobRepository();
  const scanAttempts = new InMemoryScanAttemptRepository();
  const sourceItems = new InMemorySourceItemRepository();
  const saveBatch = jest.spyOn(sourceItems, 'saveBatch');
  const failureQueue = new InMemoryScanFailureQueueAdapter(new InMemoryMetricsRecorder());
  const reporter = new ProductionCollectionScanJobReporter(scanJobs, ids, clock);
  const reporting: ScanExecutionReporterPort = {
    reportSucceeded: (command) => reporter.reportSucceeded(command),
    reportFailed: async (command) => {
      if (options.failReport) throw new Error('Synthetic report persistence failure');
      await reporter.reportFailed(command);
      if (options.changeCursor) await scanCursors.save({ ...cursorScope, cursor: movedCursor, committedAt: now });
    },
  };
  const fetch = jest.fn(async () => {
    if (!options.fetchReturns) throw new SourceFetchError({ providerKey: 'telegram', kind: 'rate_limited', retryable: true,
      retryAfterMs: 120_000, message: 'Synthetic provider failure must not be printed' });
    return { items: [{ externalId: 'hiaimediaen/30', canonicalUrl: 'https://t.me/hiaimediaen/30',
      title: 'Synthetic post', body: 'Synthetic native content', publishedAt: now }], nextCursor: movedCursor };
  });
  const fetcher: SourceFetcherPort = { fetch };
  const observed = observeTelegramCollectionOperation(fetcher, reporting);
  const project = jest.fn(async () => { throw new Error('Synthetic post-persistence failure'); });
  const executeScan = new ExecuteScanUseCase(observed.fetcher, sourceItems, { project }, scanAttempts, scanCursors, observed.reporter,
    failureQueue, new InMemoryScanLeaseAdapter(), ids, clock);
  const execute = jest.spyOn(executeScan, 'execute');
  const runtime = { executeScan, operationalState: observed.operationalState, execution: {
    scanCursors, reporter: observed.reporter, scanJobIdForAttempt: (scope: Parameters<typeof reporter.beginAttempt>[0]) => reporter.beginAttempt(scope),
    correlationId: 'synthetic-correlation', causationId: 'synthetic-causation',
  } };
  return { runtime, execute, fetch, saveBatch, project, scanJobs, scanAttempts, failureQueue, cursorScope };
};

describe('Telegram deferred provider acquisition', () => {
  it.each([false, true])('defers only a reported pre-persistence fetch failure with unchanged cursor (empty=%s)', async (emptyCursor) => {
    const fixture = await setup({ emptyCursor });
    const result = await collectTelegramChannel(target, fixture.runtime);
    expect(result).toMatchObject({ status: 'deferred', deferred: true, failureStage: 'provider_fetch', complete: false,
      fetched: 0, inserted: 0, projected: 0, skippedDuplicates: 0, warningCount: 0, pageCount: 0, backfillPending: !emptyCursor });
    expect(result.cursorBefore).toEqual(result.cursorAfter);
    expect((await fixture.runtime.execution.scanCursors.findBySourceBinding(fixture.cursorScope))?.cursor).toBe(emptyCursor ? undefined : initialCursor);
    expect(fixture.saveBatch).not.toHaveBeenCalled();
    expect(fixture.project).not.toHaveBeenCalled();
    expect((await fixture.scanJobs.findById({ ...telegramCollectionScope, scanJobId: result.scanJobId }))?.toSnapshot()).toMatchObject({
      status: 'failed', sourceBindingId: target.sourceBindingId, executionMetadata: { status: 'failed', collectedItemCount: 0 },
    });
    expect((await fixture.scanAttempts.findByScanJob({ ...telegramCollectionScope, scanJobId: result.scanJobId }))?.toSnapshot().status).toBe('failed');
    expect(fixture.failureQueue.deadLettered()).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('Synthetic provider failure');
    expect(fixture.runtime.operationalState()).toEqual({ fetchFailed: true, failureReported: true });
  });

  it('refuses deferred success after a fetch return and source persistence', async () => {
    const fixture = await setup({ fetchReturns: true });
    await expect(collectTelegramChannel(target, fixture.runtime)).rejects.toMatchObject({ code: 'collection_failed' });
    expect(fixture.saveBatch).toHaveBeenCalledTimes(1);
    expect(fixture.project).toHaveBeenCalledTimes(1);
    expect(fixture.runtime.operationalState()).toEqual({ fetchFailed: false, failureReported: true });
  });

  it('rejects sanitized reporting failure and repairs the same durable attempt without deferred success', async () => {
    const options = { failReport: true };
    const fixture = await setup(options);
    await expect(collectTelegramChannel(target, fixture.runtime)).rejects.toMatchObject({
      code: 'collection_failed', message: 'collection_failed',
    });
    await expect(fixture.execute.mock.results[0]!.value).resolves.toMatchObject({
      ok: false, error: { code: 'external.dependency_unavailable', details: { reason: 'scan_outcome_reporting_failed' } },
    });
    const command = fixture.execute.mock.calls[0]![0];
    expect(fixture.runtime.operationalState()).toEqual({ fetchFailed: true, failureReported: false });
    expect(fixture.failureQueue.deadLettered()).toEqual([
      expect.objectContaining({ scanJobId: command.scanJobId, attemptNumber: 1 }),
    ]);
    expect((await fixture.scanAttempts.findByScanJob(command))?.toSnapshot()).toMatchObject({ status: 'failed', terminalFailure: true });
    expect(await fixture.scanJobs.findById(command)).toBeNull();
    expect((await fixture.runtime.execution.scanCursors.findBySourceBinding(fixture.cursorScope))?.cursor).toBe(initialCursor);
    expect(fixture.saveBatch).not.toHaveBeenCalled();
    expect(fixture.project).not.toHaveBeenCalled();

    options.failReport = false;
    expect((await fixture.runtime.executeScan.execute(command)).ok).toBe(false);
    expect(fixture.fetch).toHaveBeenCalledTimes(1);
    expect(fixture.runtime.operationalState()).toEqual({ fetchFailed: true, failureReported: true });
    expect((await fixture.scanJobs.findById(command))?.toSnapshot().status).toBe('failed');
    expect(fixture.failureQueue.deadLettered()).toHaveLength(1);
    expect(fixture.failureQueue.retries()).toEqual([]);
    expect((await fixture.runtime.execution.scanCursors.findBySourceBinding(fixture.cursorScope))?.cursor).toBe(initialCursor);
    expect(fixture.saveBatch).not.toHaveBeenCalled();
    expect(fixture.project).not.toHaveBeenCalled();
  });

  it('refuses deferred success if the raw durable cursor changed', async () => {
    const fixture = await setup({ changeCursor: true });
    await expect(collectTelegramChannel(target, fixture.runtime)).rejects.toMatchObject({ code: 'collection_failed' });
    expect(fixture.runtime.operationalState()).toEqual({ fetchFailed: true, failureReported: true });
    expect(fixture.saveBatch).not.toHaveBeenCalled();
  });
});
