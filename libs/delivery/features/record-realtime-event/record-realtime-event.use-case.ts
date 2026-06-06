import { type Clock, DomainError, type IdGenerator, err, ok, type Result } from '@social-monitor/shared-kernel';

import { RealtimeEvent } from '../../domain';
import type { RealtimeEventRepositoryPort } from '../../ports';
import type { RecordRealtimeEventCommand } from './record-realtime-event.command';
import type { RecordRealtimeEventResult } from './record-realtime-event.result';

type RecordRealtimeEventFailure = DomainError | Error;

export class RecordRealtimeEventUseCase {
  constructor(
    private readonly realtimeEvents: RealtimeEventRepositoryPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: RecordRealtimeEventCommand,
  ): Promise<Result<RecordRealtimeEventResult, RecordRealtimeEventFailure>> {
    if (command.channel.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Realtime channel must be non-empty'));
    }

    const sequence = await this.realtimeEvents.nextSequence(command);
    const replayCursor = Buffer.from(JSON.stringify({ offset: sequence })).toString('base64url');
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
      replayCursor,
      occurredAt: this.clock.now(),
      correlationId: command.correlationId,
      payload: command.payload,
    });
    await this.realtimeEvents.append(event);
    const snapshot = event.toSnapshot();

    return ok({
      eventId: snapshot.id,
      sequence: snapshot.sequence,
      replayCursor: snapshot.replayCursor,
    });
  }
}
