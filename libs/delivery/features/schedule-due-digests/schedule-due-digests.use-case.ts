import { type Clock, DomainError, err, ok, redactSensitiveText, type Result } from '@social-monitor/shared-kernel';

import type { DigestScheduleRepositoryPort } from '../../ports';
import type { AssembleDigestUseCase } from '../assemble-digest/assemble-digest.use-case';
import type { DueDigestContinuation, ScheduleDueDigestsCommand } from './schedule-due-digests.command';
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

    if ((command.tenantId === undefined) !== (command.workspaceId === undefined)) {
      return err(new DomainError('tenant.scope_missing', 'Digest schedule scope must include tenant and workspace'));
    }
    const now = this.clock.now();
    const continuation = command.continuation?.tenantId === command.tenantId &&
      command.continuation?.workspaceId === command.workspaceId
      ? command.continuation : undefined;
    let dueBefore = continuation?.dueBefore ?? now;
    const readPage = (cutoff: Date, cursor?: DueDigestContinuation) => this.digestSchedules.findDue({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      now: cutoff,
      limit: command.limit,
      ...(cursor === undefined ? {} : { cursor: { nextRunAt: cursor.nextRunAt, id: cursor.id } }),
    });
    let schedules = await readPage(dueBefore, continuation);
    if (schedules.length === 0 && continuation !== undefined) {
      dueBefore = now;
      schedules = await readPage(dueBefore);
    }
    // Advance past the original page, including failed schedules. Successful
    // schedule writes change nextRunAt and must not move this page boundary.
    // Freeze the sweep cutoff so newly due windows cannot postpone wrap forever.
    const last = schedules.at(-1)?.toSnapshot();
    const digests: ScheduledDigestResultItem[] = [];
    let skipped = 0;
    const failures: { digestScheduleId: string; message: string }[] = [];

    for (const schedule of schedules) {
      const snapshot = schedule.toSnapshot();
      const windowEndedAt = snapshot.nextRunAt;
      const windowStartedAt = new Date(windowEndedAt.getTime() - snapshot.intervalSeconds * 1000);
      try {
        const assembled = await this.assembleDigest.execute({
          tenantId: snapshot.tenantId,
          workspaceId: snapshot.workspaceId,
          recipientKey: snapshot.recipientKey,
          channel: snapshot.channel,
          interestIds: snapshot.interestIds,
          windowStartedAt,
          windowEndedAt,
          includeNoSignal: snapshot.includeNoSignal,
        });

        if (!assembled.ok) throw assembled.error;

        await this.digestSchedules.save(schedule.scheduleNext({
          nextRunAt: new Date(snapshot.nextRunAt.getTime() + snapshot.intervalSeconds * 1000),
        }));
        digests.push({
          digestScheduleId: snapshot.id,
          digestId: assembled.value.digest.id,
          deliveryAttemptId: assembled.value.deliveryAttemptId,
          created: assembled.value.created,
        });
      } catch (error) {
        // Keep the failed window due. A retry repairs a saved digest's delivery
        // intent, while unrelated schedules in this page keep progressing.
        skipped += 1;
        failures.push({
          digestScheduleId: snapshot.id,
          message: redactSensitiveText(error instanceof Error ? error.message : 'Digest scheduling failed')
            .replace(/[\r\n]+/g, ' ').slice(0, 240),
        });
      }
    }

    return ok({
      scannedAt: now,
      ...(schedules.length === command.limit && last !== undefined ? {
        continuation: {
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          dueBefore,
          nextRunAt: last.nextRunAt,
          id: last.id,
        },
      } : {}),
      evaluated: schedules.length,
      assembled: digests.length,
      skipped,
      digests,
      ...(failures.length === 0 ? {} : { failures }),
    });
  }
}
