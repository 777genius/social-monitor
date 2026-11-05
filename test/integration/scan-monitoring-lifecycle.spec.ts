import { FixedClock } from '@social-monitor/shared-kernel';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { InMemoryScanFailureQueueAdapter } from '@social-monitor/ingestion/adapters/queue/in-memory-scan-failure-queue.adapter';
import { InMemoryScanJobRepository } from '@social-monitor/monitoring/adapters/persistence/in-memory-scan-job.repository';
import { MonitoringScanExecutionReporterAdapter } from '@social-monitor/monitoring/adapters/reporting/monitoring-scan-execution-reporter.adapter';
import { ScanJob } from '@social-monitor/monitoring/domain';
import { RecordScanExecutionUseCase } from '@social-monitor/monitoring/features/record-scan-execution/record-scan-execution.use-case';

import type { SourceFetcherPort } from '@social-monitor/ingestion/ports';
import { ExecuteScanUseCase } from '@social-monitor/ingestion/features/execute-scan/execute-scan.use-case';
import {
  FakeFeedProjection, FakeScanAttemptRepository, FakeScanCursorRepository,
  FakeScanLease, FakeSourceItemRepository,
  FixedSourceFetcher, SequenceIdGenerator, makeExecuteScanCommand,
} from '@social-monitor/ingestion/features/execute-scan/execute-scan.use-case.spec-support';

const setup = async (fetcher: SourceFetcherPort = new FixedSourceFetcher()) => {
  const command = makeExecuteScanCommand();
  const jobs = new InMemoryScanJobRepository();
  await jobs.save(ScanJob.request({
    ...command, id: command.scanJobId, idempotencyKey: 'lifecycle-sandbox',
    requestedAt: new Date('2026-06-05T11:00:00Z'),
  }).markEnqueued({ enqueuedAt: new Date('2026-06-05T11:00:01Z') }));
  const attempts = new FakeScanAttemptRepository();
  const failures = new InMemoryScanFailureQueueAdapter(new InMemoryMetricsRecorder());
  const items = new FakeSourceItemRepository();
  const report = new RecordScanExecutionUseCase(jobs);
  const reporter = new MonitoringScanExecutionReporterAdapter(report);
  const leases = new FakeScanLease();
  const useCase = new ExecuteScanUseCase(
    fetcher, items, new FakeFeedProjection(), attempts, new FakeScanCursorRepository(),
    reporter, failures, leases, new SequenceIdGenerator(),
    new FixedClock(new Date('2026-06-05T12:00:00Z')),
  );
  return { command, jobs, attempts, failures, items, report, reporter, leases, useCase };
};

describe('scan ingestion and monitoring lifecycle integration', () => {
  it('keeps a transient attempt active until the successful retry completes', async () => {
    const successful = new FixedSourceFetcher();
    let calls = 0;
    const context = await setup({ fetch: async (command) => {
      if (++calls === 1) throw new Error('Provider unavailable');
      return successful.fetch(command);
    } });
    expect((await context.useCase.execute(context.command)).ok).toBe(false);
    expect((await context.jobs.findById(context.command))?.toSnapshot().status).toBe('enqueued');
    expect(context.failures.retries()).toHaveLength(1);

    const result = await context.useCase.execute({ ...context.command, attemptNumber: 2 });
    expect(result.ok).toBe(true);
    expect(context.items.all()).toHaveLength(2);
    expect((await context.attempts.findByScanJob(context.command))?.toSnapshot().status).toBe('succeeded');
    expect((await context.jobs.findById(context.command))?.toSnapshot().status).toBe('succeeded');
    expect(context.failures.deadLettered()).toHaveLength(0);
  });

  it('preserves successful ingestion and heals outcome reporting on redelivery', async () => {
    const fetcher = new FixedSourceFetcher();
    const context = await setup(fetcher);
    jest.spyOn(context.reporter, 'reportSucceeded').mockRejectedValueOnce(new Error('Reporting persistence unavailable'));
    expect((await context.useCase.execute(context.command)).ok).toBe(false);
    expect((await context.attempts.findByScanJob(context.command))?.toSnapshot().status).toBe('succeeded');
    expect(context.failures.retries()).toHaveLength(0);
    expect(context.failures.deadLettered()).toHaveLength(0);
    expect((await context.jobs.findById(context.command))?.toSnapshot().status).toBe('enqueued');

    expect((await context.useCase.execute(context.command)).ok).toBe(true);
    expect((await context.jobs.findById(context.command))?.toSnapshot().status).toBe('succeeded');
    expect(fetcher.calls).toHaveLength(1);
  });

  it('completes failure only when retries are exhausted and preserves terminal state', async () => {
    const context = await setup({ fetch: async () => { throw new Error('Provider unavailable'); } });
    expect((await context.useCase.execute({ ...context.command, retryBudget: 1 })).ok).toBe(false);
    const completed = (await context.jobs.findById(context.command))?.toSnapshot();
    expect(completed?.status).toBe('failed');
    expect(context.failures.deadLettered()).toHaveLength(1);
    const replay = await context.report.execute({
      ...context.command, status: 'failed', completedAt: new Date('2026-06-05T13:00:00Z'),
      failureReason: 'Duplicate report',
    });
    expect(replay.ok).toBe(true);
    expect((await context.jobs.findById(context.command))?.toSnapshot()).toEqual(completed);
    const conflict = await context.report.execute({
      ...context.command, status: 'succeeded', completedAt: new Date('2026-06-05T13:00:00Z'),
    });
    expect(conflict.ok).toBe(false);
    expect(conflict.ok ? undefined : conflict.error).toMatchObject({ code: 'operation.conflict' });
    expect((await context.jobs.findById(context.command))?.toSnapshot()).toEqual(completed);
  });

  it('replays successful reports without rewriting completion time or accepting failure', async () => {
    const context = await setup();
    expect((await context.useCase.execute(context.command)).ok).toBe(true);
    const completed = (await context.jobs.findById(context.command))?.toSnapshot();
    expect((await context.report.execute({
      ...context.command, status: 'succeeded', completedAt: new Date('2026-06-05T13:00:00Z'),
    })).ok).toBe(true);
    expect((await context.report.execute({
      ...context.command, status: 'failed', completedAt: new Date('2026-06-05T13:00:00Z'),
      failureReason: 'Stale failure report',
    })).ok).toBe(false);
    expect((await context.jobs.findById(context.command))?.toSnapshot()).toEqual(completed);
  });

  it('retries terminal failure reporting without fetching or accepting a later attempt', async () => {
    const fetch = jest.fn(async () => { throw new Error('Provider unavailable'); });
    const context = await setup({ fetch });
    jest.spyOn(context.reporter, 'reportFailed').mockRejectedValueOnce(new Error('Reporting unavailable'));
    const failedReport = await context.useCase.execute({ ...context.command, retryBudget: 1 });
    expect(failedReport.ok).toBe(false);
    expect(failedReport.ok ? undefined : failedReport.error).toMatchObject({
      details: { reason: 'scan_outcome_reporting_failed' },
    });
    expect((await context.attempts.findByScanJob(context.command))?.toSnapshot().terminalFailure).toBe(true);
    expect((await context.jobs.findById(context.command))?.toSnapshot().status).toBe('enqueued');

    expect((await context.useCase.execute({ ...context.command, attemptNumber: 2 })).ok).toBe(false);
    expect((await context.jobs.findById(context.command))?.toSnapshot().status).toBe('failed');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(context.failures.deadLettered()).toHaveLength(1);
  });

  it('recovers failed retry recording on redelivery without repeating provider work', async () => {
    const fetch = jest.fn(async () => { throw new Error('Provider unavailable'); });
    const context = await setup({ fetch });
    jest.spyOn(context.failures, 'enqueueRetry').mockRejectedValueOnce(new Error('Failure queue unavailable'));
    const first = await context.useCase.execute(context.command);
    expect(first.ok ? undefined : first.error).toMatchObject({ details: { reason: 'scan_failure_recording_failed' } });
    const replay = await context.useCase.execute(context.command);
    expect(replay.ok ? undefined : replay.error).toMatchObject({
      details: { reason: 'scan_failure_recorded', disposition: 'retry_scheduled' },
    });
    await context.useCase.execute(context.command);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(context.failures.retries()).toHaveLength(1);
    expect((await context.jobs.findById(context.command))?.toSnapshot().status).toBe('enqueued');
  });

  it('elects one concurrent terminal outcome and treats matching concurrent replay as idempotent', async () => {
    const context = await setup();
    const outcomes = await Promise.all([
      context.report.execute({ ...context.command, status: 'succeeded', completedAt: new Date('2026-06-05T12:00:00Z') }),
      context.report.execute({ ...context.command, status: 'failed', completedAt: new Date('2026-06-05T12:00:00Z'), failureReason: 'Stale worker' }),
    ]);
    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
    expect(outcomes.find((outcome) => !outcome.ok)).toMatchObject({ error: { code: 'operation.conflict' } });
    expect((await context.jobs.findById(context.command))?.toSnapshot().status).toBe('succeeded');
    const replays = await Promise.all([1, 2].map(() => context.report.execute({
      ...context.command, status: 'succeeded', completedAt: new Date('2026-06-05T13:00:00Z'),
    })));
    expect(replays.every((replay) => replay.ok)).toBe(true);
  });

  it('keeps failed reporting recoverable when lease release also fails', async () => {
    const fetcher = new FixedSourceFetcher();
    const context = await setup(fetcher);
    jest.spyOn(context.reporter, 'reportSucceeded').mockRejectedValueOnce(new Error('Reporter unavailable'));
    jest.spyOn(context.leases, 'release').mockRejectedValueOnce(new Error('Lease persistence unavailable'));
    expect(await context.useCase.execute(context.command)).toMatchObject({
      ok: false, error: { details: { reason: 'scan_lease_release_failed' } },
    });
    expect((await context.attempts.findByScanJob(context.command))?.toSnapshot().status).toBe('succeeded');
    // Simulate lease expiry after the crashed release; persisted ingestion remains reusable.
    const current = context.leases.current(context.command);
    if (current !== null) await context.leases.release(current);
    expect((await context.useCase.execute(context.command)).ok).toBe(true);
    expect(fetcher.calls).toHaveLength(1);
    expect((await context.jobs.findById(context.command))?.toSnapshot().status).toBe('succeeded');
  });
});
