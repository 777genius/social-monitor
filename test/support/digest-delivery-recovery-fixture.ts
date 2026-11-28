import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { InMemoryDeliveryAttemptRepository } from '@social-monitor/delivery/adapters/persistence/in-memory-delivery-attempt.repository';
import { InMemoryDigestRepository } from '@social-monitor/delivery/adapters/persistence/in-memory-digest.repository';
import { InMemoryDigestScheduleRepository } from '@social-monitor/delivery/adapters/persistence/in-memory-digest-schedule.repository';
import { DigestSchedule } from '@social-monitor/delivery/domain';
import type { DigestSourceReaderPort } from '@social-monitor/delivery/ports';
import { QueueDeliveryAttemptUseCase } from '@social-monitor/delivery/features/queue-delivery-attempt/queue-delivery-attempt.use-case';
import { ScheduleDueDigestsUseCase } from '@social-monitor/delivery/features/schedule-due-digests/schedule-due-digests.use-case';
import { AssembleDigestUseCase } from '@social-monitor/delivery/features/assemble-digest/assemble-digest.use-case';

export const recoveryTenant = tenantId('tenant-digest-recovery');
export const recoveryWorkspace = workspaceId('workspace-digest-recovery');
export const recoveryNow = new Date('2026-11-27T01:00:00.000Z');
export const recoveryCommand = {
  tenantId: recoveryTenant,
  workspaceId: recoveryWorkspace,
  recipientKey: 'recipient-a',
  channel: 'in_app' as const,
  interestIds: ['interest-a'],
  windowStartedAt: new Date('2026-11-27T00:00:00.000Z'),
  windowEndedAt: recoveryNow,
  includeNoSignal: false,
};

export const setupDigestRecovery = () => {
  const clock = new FixedClock(recoveryNow);
  let sequence = 0;
  const ids = { generate: () => 'digest-recovery-' + ++sequence };
  const digests = new InMemoryDigestRepository();
  const attempts = new InMemoryDeliveryAttemptRepository();
  const schedules = new InMemoryDigestScheduleRepository();
  const sources = {
    readWindow: jest.fn<ReturnType<DigestSourceReaderPort['readWindow']>, Parameters<DigestSourceReaderPort['readWindow']>>(
      async (query) => ({
        summaries: [],
        feedItems: [{
          tenantId: query.tenantId, workspaceId: query.workspaceId,
          feedItemId: 'feed-item-a', interestId: query.interestIds[0]!,
          observedAt: query.startedAt, signal: 'normal' as const,
        }],
      }),
    ),
  };
  const assemble = new AssembleDigestUseCase(
    digests, sources, new QueueDeliveryAttemptUseCase(attempts, ids, clock), ids, clock,
  );
  const scheduler = new ScheduleDueDigestsUseCase(schedules, assemble, clock);
  const addSchedule = async (id: string, recipientKey = recoveryCommand.recipientKey) => {
    const schedule = DigestSchedule.create({
      id, tenantId: recoveryTenant, workspaceId: recoveryWorkspace, recipientKey,
      channel: 'in_app', interestIds: ['interest-a'], intervalSeconds: 3600,
      includeNoSignal: false, nextRunAt: recoveryNow,
      createdAt: recoveryCommand.windowStartedAt,
    });
    await schedules.save(schedule);
    return schedule;
  };
  const listAttempts = async () => (await attempts.list({
    tenantId: recoveryTenant, workspaceId: recoveryWorkspace, limit: 100,
  })).attempts;
  const tick = async () => {
    const result = await scheduler.execute({
      tenantId: recoveryTenant, workspaceId: recoveryWorkspace, limit: 10,
    });
    if (!result.ok) throw result.error;
    return result.value;
  };
  const findSchedule = (digestScheduleId: string) => schedules.findById({
    tenantId: recoveryTenant, workspaceId: recoveryWorkspace, digestScheduleId,
  });
  return { clock, digests, attempts, schedules, sources, assemble, scheduler, addSchedule, listAttempts, tick, findSchedule };
};
