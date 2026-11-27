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
});
