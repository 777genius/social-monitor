import { Test } from '@nestjs/testing';
import { FixedClock, ok, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { InMemoryReaderSummaryJobQueueAdapter } from '@social-monitor/summary/adapters/messaging/reader-summary-job-queue.adapter';
import { InMemoryReaderSummaryJobRepository } from '@social-monitor/summary/adapters/persistence/in-memory-reader-summary-job.repository';
import { InMemoryReaderSummaryPolicyRepository } from '@social-monitor/summary/adapters/persistence/in-memory-reader-summary-policy.repository';
import { defaultReaderSummaryGenerationPolicy, ReaderSummaryPolicy } from '@social-monitor/summary/domain';
import { RequestReaderSummaryUseCase } from '@social-monitor/summary/features/request-reader-summary/request-reader-summary.use-case';
import { SchedulePeriodicReaderSummariesUseCase } from '@social-monitor/summary/features/schedule-periodic-reader-summaries/schedule-periodic-reader-summaries.use-case';

import { PeriodicReaderSummarySchedulerLoop } from '../../apps/intelligence-worker/src/periodic-reader-summary-scheduler-loop';

const now = new Date('2026-11-27T12:00:00.000Z');
const fixture = async (limit: number) => {
  const policies = new InMemoryReaderSummaryPolicyRepository();
  for (const id of ['a', 'b', 'c', 'd', 'e']) {
    await policies.save(ReaderSummaryPolicy.create({
      id, tenantId: tenantId('tenant-' + id), workspaceId: workspaceId('workspace-' + id),
      scope: { type: 'workspace' }, ...defaultReaderSummaryGenerationPolicy(),
      schedule: { enabled: true, timezone: 'UTC', cadences: ['daily'] },
      createdAt: now, updatedAt: now,
    }));
  }
  const jobs = new InMemoryReaderSummaryJobRepository();
  const queue = new InMemoryReaderSummaryJobQueueAdapter();
  const clock = new FixedClock(now);
  let sequence = 0;
  const reserveSummaryJob = jest.fn(async () => ok({ remaining: 100, resetAt: '2026-11-28T00:00:00.000Z' }));
  const request = new RequestReaderSummaryUseCase(
    jobs, queue, { reserveSummaryJob }, { generate: () => 'periodic-e2e-' + ++sequence }, clock,
  );
  const schedule = new SchedulePeriodicReaderSummariesUseCase(policies, request, jobs);
  const loop = new PeriodicReaderSummarySchedulerLoop(schedule, {
    enabled: true, intervalMs: 1_000, limit, runOnStart: true, readyAtUtc: { hour: 6, minute: 0 },
  }, clock);
  const module = await Test.createTestingModule({
    providers: [{ provide: PeriodicReaderSummarySchedulerLoop, useValue: loop }],
  }).compile();
  return { module, policies, jobs, queue, loop, reserveSummaryJob };
};

describe('periodic scheduler worker lifecycle to durable job admission', () => {
  beforeEach(() => jest.useFakeTimers({ now }));
  afterEach(() => jest.useRealTimers());

  it('serves every tenant over multiple bounded ticks and stops cleanly', async () => {
    const d = await fixture(2);
    try {
      await d.module.init();
      await jest.advanceTimersByTimeAsync(2_000);
      expect(new Set(d.queue.all().map((command) => command.workspaceId)).size).toBe(5);
      expect(d.jobs.all()).toHaveLength(5);
      expect(d.reserveSummaryJob).toHaveBeenCalledTimes(5);
      await jest.advanceTimersByTimeAsync(5_000);
      expect(d.queue.all()).toHaveLength(5);
      expect(d.reserveSummaryJob).toHaveBeenCalledTimes(5);
    } finally {
      await d.module.close();
    }
    const count = d.queue.all().length;
    await jest.advanceTimersByTimeAsync(5_000);
    expect(d.queue.all()).toHaveLength(count);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('resumes the next tenant after a failed polling tick without manual restart', async () => {
    const d = await fixture(1);
    try {
      await d.module.init();
      jest.spyOn(d.policies, 'listScheduled').mockRejectedValueOnce(new Error('temporary database outage'));
      await jest.advanceTimersByTimeAsync(1_000);
      expect(d.queue.all()).toHaveLength(1);
      await jest.advanceTimersByTimeAsync(1_000);
      expect(d.queue.all().map((command) => command.workspaceId)).toEqual(['workspace-a', 'workspace-b']);
      expect(d.jobs.all()).toHaveLength(2);
    } finally {
      await d.module.close();
    }
  });

  it('does not recreate the timer when shutdown overlaps the first database request', async () => {
    const d = await fixture(1);
    const listScheduled = d.policies.listScheduled.bind(d.policies);
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let entered = (): void => undefined;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    jest.spyOn(d.policies, 'listScheduled').mockImplementationOnce(async (query) => {
      entered();
      await gate;
      return listScheduled(query);
    });
    const startup = d.loop.onModuleInit();
    await started;
    const shutdown = d.loop.onModuleDestroy();
    release();
    try {
      await Promise.all([startup, shutdown]);
      await jest.advanceTimersByTimeAsync(5_000);
      expect(d.queue.all()).toHaveLength(1);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      await d.module.close();
    }
  });
});
