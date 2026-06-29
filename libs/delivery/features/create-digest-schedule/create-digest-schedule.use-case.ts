import {
  type Clock,
  DomainError,
  type IdGenerator,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import {
  allDeliveryChannels,
  DigestSchedule,
  type DeliveryChannelPolicy,
  isDeliveryChannelSupported,
} from '../../domain';
import type { DigestScheduleRepositoryPort } from '../../ports';
import { presentDigestSchedule } from '../shared/digest-schedule-presenter';
import type { CreateDigestScheduleCommand } from './create-digest-schedule.command';
import type { CreateDigestScheduleResult } from './create-digest-schedule.result';

type CreateDigestScheduleFailure = DomainError | Error;

export class CreateDigestScheduleUseCase {
  constructor(
    private readonly schedules: DigestScheduleRepositoryPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly supportedChannels: DeliveryChannelPolicy = allDeliveryChannels,
  ) {}

  async execute(
    command: CreateDigestScheduleCommand,
  ): Promise<Result<CreateDigestScheduleResult, CreateDigestScheduleFailure>> {
    const validation = validate(command, this.supportedChannels);

    if (validation !== null) {
      return err(validation);
    }

    try {
      const schedule = DigestSchedule.create({
        id: this.ids.generate(),
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        recipientKey: command.recipientKey,
        channel: command.channel,
        interestIds: command.interestIds,
        intervalSeconds: command.intervalSeconds,
        includeNoSignal: command.includeNoSignal,
        nextRunAt: command.nextRunAt ?? new Date(this.clock.now().getTime() + command.intervalSeconds * 1000),
        createdAt: this.clock.now(),
      });

      await this.schedules.save(schedule);

      return ok({
        schedule: presentDigestSchedule(schedule),
        created: true,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error('Digest schedule creation failed'));
    }
  }
}

const validate = (
  command: CreateDigestScheduleCommand,
  supportedChannels: DeliveryChannelPolicy,
): DomainError | null => {
  if (!isDeliveryChannelSupported(command.channel, supportedChannels)) {
    return new DomainError('validation.failed', 'Digest schedule channel is not supported', {
      channel: command.channel,
      supportedChannels,
    });
  }

  if (
    !Number.isInteger(command.intervalSeconds) ||
    command.intervalSeconds < 60 ||
    command.intervalSeconds > 2_592_000
  ) {
    return new DomainError('validation.failed', 'Digest schedule interval must be between 60 and 2592000 seconds');
  }

  if (command.nextRunAt !== undefined && Number.isNaN(command.nextRunAt.getTime())) {
    return new DomainError('validation.failed', 'Digest schedule nextRunAt must be a valid date');
  }

  return null;
};
