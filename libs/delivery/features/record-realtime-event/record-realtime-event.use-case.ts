import { type Clock, DomainError, type IdGenerator, err, ok, type Result } from '@social-monitor/shared-kernel';

import { encodeRealtimeReplayCursor, RealtimeEvent } from '../../domain';
import {
  RealtimeEventSequenceConflictError,
  type RealtimeEventRepositoryPort,
  type RealtimeFanoutPort,
} from '../../ports';
import type { RecordRealtimeEventCommand } from './record-realtime-event.command';
import type { RecordRealtimeEventResult } from './record-realtime-event.result';

type RecordRealtimeEventFailure = DomainError | Error;
const MAX_SEQUENCE_RETRIES = 3;
const noopRealtimeFanout: RealtimeFanoutPort = {
  async publish(): Promise<void> {
    return undefined;
  },
};

export class RecordRealtimeEventUseCase {
  constructor(
    private readonly realtimeEvents: RealtimeEventRepositoryPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly fanout: RealtimeFanoutPort = noopRealtimeFanout,
  ) {}

  async execute(
    command: RecordRealtimeEventCommand,
  ): Promise<Result<RecordRealtimeEventResult, RecordRealtimeEventFailure>> {
    if (command.channel.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Realtime channel must be non-empty'));
    }

    for (let attempt = 1; attempt <= MAX_SEQUENCE_RETRIES; attempt += 1) {
      const sequence = await this.realtimeEvents.nextSequence(command);
      const event = RealtimeEvent.create({
        id: this.ids.generate(),
        protocolVersion: 1,
        eventType: command.eventType,
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        channel: command.channel,
        resourceType: command.resourceType,
        resourceId: command.resourceId,
        sequence,
        replayCursor: encodeRealtimeReplayCursor(sequence),
        occurredAt: this.clock.now(),
        correlationId: command.correlationId,
        payload: command.payload,
      });

      try {
        await this.realtimeEvents.append(event);
      } catch (error) {
        if (error instanceof RealtimeEventSequenceConflictError && attempt < MAX_SEQUENCE_RETRIES) {
          continue;
        }

        return err(error instanceof Error ? error : new Error('Realtime event append failed'));
      }

      await this.publishBestEffort(event);

      const snapshot = event.toSnapshot();

      return ok({
        eventId: snapshot.id,
        sequence: snapshot.sequence,
        replayCursor: snapshot.replayCursor,
      });
    }

    return err(new DomainError('operation.conflict', 'Realtime event sequence conflict was not resolved'));
  }

  private async publishBestEffort(event: RealtimeEvent): Promise<void> {
    try {
      await this.fanout.publish(event);
    } catch {
      return undefined;
    }
  }
}
