import { type Clock, DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { DigestScheduleRepositoryPort } from '../../ports';
import type { AssembleDigestUseCase } from '../assemble-digest/assemble-digest.use-case';
import type { ScheduleDueDigestsCommand } from './schedule-due-digests.command';
import type { ScheduledDigestResultItem, ScheduleDueDigestsResult } from './schedule-due-digests.result';

type ScheduleDueDigestsFailure = DomainError | Error;

export class ScheduleDueDigestsUseCase {
  constructor(
    private readonly digestSchedules: DigestScheduleRepositoryPort,
    private readonly assembleDigest: AssembleDigestUseCase,
    private readonly clock: Clock,
  ) {}

  async execute(command: ScheduleDueDigestsCommand): Promise<Result<ScheduleDueDigestsResult, ScheduleDueDigestsFailure>> {
    if (!Number.isInteger(command.limit) || command.limit < 1 || command.limit > 100) {
      return err(new DomainError('validation.failed', 'Schedule due digests limit must be between 1 and 100'));
    }

    const now = this.clock.now();
    const schedules = await this.digestSchedules.findDue({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      now,
      limit: command.limit,
    });
    const digests: ScheduledDigestResultItem[] = [];
    let skipped = 0;

    for (const schedule of schedules) {
      const snapshot = schedule.toSnapshot();
      const windowEndedAt = snapshot.nextRunAt;
      const windowStartedAt = new Date(windowEndedAt.getTime() - snapshot.intervalSeconds * 1000);
      const assembled = await this.assembleDigest.execute({
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        recipientKey: snapshot.recipientKey,
        channel: snapshot.channel,
        topicIds: snapshot.topicIds,
        windowStartedAt,
        windowEndedAt,
        includeNoSignal: snapshot.includeNoSignal,
      });

      if (!assembled.ok) {
        skipped += 1;
        continue;
      }

      digests.push({
        digestScheduleId: snapshot.id,
        digestId: assembled.value.digest.id,
        deliveryAttemptId: assembled.value.deliveryAttemptId,
        created: assembled.value.created,
      });
      await this.digestSchedules.save(schedule.scheduleNext({
        nextRunAt: new Date(snapshot.nextRunAt.getTime() + snapshot.intervalSeconds * 1000),
      }));
    }

    return ok({
      scannedAt: now,
      evaluated: schedules.length,
      assembled: digests.length,
      skipped,
      digests,
    });
  }
}
