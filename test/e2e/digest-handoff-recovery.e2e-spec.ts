import { Test } from '@nestjs/testing';
import { ScheduleDueDigestsCommandHandler } from '@social-monitor/delivery/interfaces/queue/schedule-due-digests-command.handler';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { WorkerRuntime } from '@social-monitor/platform-worker';

import { DigestSchedulerLoop } from '../../apps/delivery-service/src/digest-scheduler-loop';
import { recoveryNow, setupDigestRecovery } from '../support/digest-delivery-recovery-fixture';

describe('digest worker startup through retry admission and schedule advancement', () => {
  beforeEach(() => jest.useFakeTimers({ now: recoveryNow }));
  afterEach(() => jest.useRealTimers());

  it('repairs a failed handoff on its next tick while a healthy sibling progresses', async () => {
    const d = setupDigestRecovery();
    await d.addSchedule('schedule-a', 'recipient-a');
    await d.addSchedule('schedule-b', 'recipient-b');
    jest.spyOn(d.attempts, 'save').mockRejectedValueOnce(new Error('transient attempt persistence failure'));
    const runtime = new WorkerRuntime({ serviceName: 'delivery-service' });
    const metrics = new InMemoryMetricsRecorder();
    const handler = new ScheduleDueDigestsCommandHandler(d.scheduler, metrics, runtime);
    const loop = new DigestSchedulerLoop(handler, {
      enabled: true, intervalMs: 1_000, limit: 10, runOnStart: true,
    });
    const module = await Test.createTestingModule({
      providers: [{ provide: DigestSchedulerLoop, useValue: loop }],
    }).compile();
    // A real app starts WorkerRuntime before admitting commands.
    runtime.onModuleInit();
    try {
      await module.init();
      expect((await d.findSchedule('schedule-a'))?.toSnapshot().nextRunAt).toEqual(recoveryNow);
      expect((await d.findSchedule('schedule-b'))?.toSnapshot().nextRunAt).toEqual(new Date('2026-11-27T02:00:00.000Z'));
      expect(await d.listAttempts()).toHaveLength(1);
      await jest.advanceTimersByTimeAsync(1_000);
      expect((await d.findSchedule('schedule-a'))?.toSnapshot().nextRunAt).toEqual(new Date('2026-11-27T02:00:00.000Z'));
      expect(await d.listAttempts()).toHaveLength(2);
      expect(d.sources.readWindow).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(2_000);
      expect(await d.listAttempts()).toHaveLength(2);
      expect(metrics.counterValue('delivery_digest_scheduler_runs_total', {
        status: 'succeeded', worker: 'delivery-service',
      })).toBe(4);
    } finally {
      await module.close();
      await runtime.onApplicationShutdown('digest-recovery-e2e');
    }
    expect(jest.getTimerCount()).toBe(0);
  });

  it('moves past a poison first page, retains progress after a read failure, and retries on wrap', async () => {
    const d = setupDigestRecovery();
    await d.addSchedule('schedule-a', 'poison-recipient');
    await d.addSchedule('schedule-b', 'healthy-recipient');
    let failing = true;
    const persist = d.attempts.save.bind(d.attempts);
    jest.spyOn(d.attempts, 'save').mockImplementation(async (attempt) => {
      if (failing && attempt.toSnapshot().recipientKey === 'poison-recipient') {
        throw new Error('poison delivery unavailable');
      }
      await persist(attempt);
    });
    const runtime = new WorkerRuntime({ serviceName: 'delivery-service' });
    const handler = new ScheduleDueDigestsCommandHandler(d.scheduler, new InMemoryMetricsRecorder(), runtime);
    const loop = new DigestSchedulerLoop(handler, {
      enabled: true, intervalMs: 1_000, limit: 1, runOnStart: true,
    });
    const module = await Test.createTestingModule({
      providers: [{ provide: DigestSchedulerLoop, useValue: loop }],
    }).compile();
    runtime.onModuleInit();
    try {
      await module.init();
      expect(await d.listAttempts()).toHaveLength(0);
      const findDue = jest.spyOn(d.schedules, 'findDue').mockRejectedValueOnce(new Error('poll failed'));
      await jest.advanceTimersByTimeAsync(1_000);
      expect(await d.listAttempts()).toHaveLength(0);
      await jest.advanceTimersByTimeAsync(1_000);
      expect((await d.listAttempts()).map((attempt) => attempt.toSnapshot().recipientKey))
        .toEqual(['healthy-recipient']);
      expect((await d.findSchedule('schedule-a'))?.toSnapshot().nextRunAt).toEqual(recoveryNow);

      findDue.mockClear();
      await jest.advanceTimersByTimeAsync(1_000);
      // The failed head is revisited after exactly one empty tail-page lookup.
      expect(findDue).toHaveBeenCalledTimes(2);
      expect(await d.listAttempts()).toHaveLength(1);
      failing = false;
      await jest.advanceTimersByTimeAsync(1_000);
      expect(await d.listAttempts()).toHaveLength(2);
      expect((await d.findSchedule('schedule-a'))?.toSnapshot().nextRunAt)
        .toEqual(new Date('2026-11-27T02:00:00.000Z'));
      expect(d.sources.readWindow).toHaveBeenCalledTimes(2);
    } finally {
      await module.close();
      await runtime.onApplicationShutdown('digest-fairness-e2e');
    }
    expect(jest.getTimerCount()).toBe(0);
  });

  it('retries a failed head before a healthy sibling can extend the sweep with its next due window', async () => {
    const d = setupDigestRecovery();
    jest.spyOn(d.clock, 'now').mockImplementation(() => new Date(Date.now()));
    await d.addSchedule('schedule-a', 'poison-recipient');
    await d.addSchedule('schedule-b', 'healthy-recipient');
    const saveAttempt = jest.spyOn(d.attempts, 'save')
      .mockRejectedValueOnce(new Error('transient attempt persistence failure'));
    const runtime = new WorkerRuntime({ serviceName: 'delivery-service' });
    const handler = new ScheduleDueDigestsCommandHandler(d.scheduler, new InMemoryMetricsRecorder(), runtime);
    const loop = new DigestSchedulerLoop(handler, {
      enabled: true, intervalMs: 3_600_000, limit: 1, runOnStart: true,
    });
    const module = await Test.createTestingModule({
      providers: [{ provide: DigestSchedulerLoop, useValue: loop }],
    }).compile();
    runtime.onModuleInit();
    try {
      await module.init();
      expect(saveAttempt).toHaveBeenCalledTimes(1);
      expect(await d.listAttempts()).toHaveLength(0);
      const failedAttempt = saveAttempt.mock.calls[0]![0].toSnapshot();
      const digestLookup = {
        tenantId: failedAttempt.tenantId,
        workspaceId: failedAttempt.workspaceId,
        digestId: failedAttempt.resourceId,
      };
      const savedDigest = (await d.digests.findById(digestLookup))?.toSnapshot();
      expect(savedDigest).toMatchObject({ recipientKey: 'poison-recipient', assembledAt: recoveryNow });
      expect((await d.findSchedule('schedule-a'))?.toSnapshot().nextRunAt).toEqual(recoveryNow);

      await jest.advanceTimersByTimeAsync(3_600_000);
      expect((await d.listAttempts()).map((attempt) => attempt.toSnapshot().recipientKey))
        .toEqual(['healthy-recipient']);
      const nextHealthyWindow = new Date('2026-11-27T02:00:00.000Z');
      expect((await d.findSchedule('schedule-b'))?.toSnapshot().nextRunAt).toEqual(nextHealthyWindow);
      expect((await d.findSchedule('schedule-a'))?.toSnapshot().nextRunAt).toEqual(recoveryNow);

      // B is due again, but the completed sweep must return to A without a restart.
      await jest.advanceTimersByTimeAsync(3_600_000);
      expect(Date.now()).toBe(new Date('2026-11-27T03:00:00.000Z').getTime());
      const attempts = (await d.listAttempts()).map((attempt) => attempt.toSnapshot());
      expect(attempts).toHaveLength(2);
      expect(attempts.map((attempt) => attempt.recipientKey))
        .toEqual(['poison-recipient', 'healthy-recipient']);
      expect(attempts[0]?.resourceId).toBe(failedAttempt.resourceId);
      expect((await d.digests.findById(digestLookup))?.toSnapshot()).toEqual(savedDigest);
      expect((await d.findSchedule('schedule-a'))?.toSnapshot().nextRunAt).toEqual(nextHealthyWindow);
      expect((await d.findSchedule('schedule-b'))?.toSnapshot().nextRunAt).toEqual(nextHealthyWindow);
      expect(saveAttempt.mock.calls.map(([attempt]) => attempt.toSnapshot().recipientKey))
        .toEqual(['poison-recipient', 'healthy-recipient', 'poison-recipient']);
      expect(d.sources.readWindow).toHaveBeenCalledTimes(2);
    } finally {
      await module.close();
      await runtime.onApplicationShutdown('digest-bounded-sweep-e2e');
    }
    expect(jest.getTimerCount()).toBe(0);
  });
});
