import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { RecordRealtimeEventUseCase } from '../record-realtime-event/record-realtime-event.use-case';
import type { ProjectSummaryReadyEventCommand } from './project-summary-ready-event.command';

export type ProjectSummaryReadyEventResult = {
  readonly realtimeEventId: string;
  readonly channel: string;
  readonly sequence: number;
};

type ProjectSummaryReadyEventFailure = DomainError | Error;

export class ProjectSummaryReadyEventUseCase {
  constructor(private readonly recordRealtimeEvent: RecordRealtimeEventUseCase) {}

  async execute(
    command: ProjectSummaryReadyEventCommand,
  ): Promise<Result<ProjectSummaryReadyEventResult, ProjectSummaryReadyEventFailure>> {
    if (command.event.eventType !== 'summary.ready') {
      return err(new DomainError('validation.failed', 'Unsupported summary realtime projection event type'));
    }

    const channel = `topic:${command.event.payload.topicId}:summary-status`;
    const result = await this.recordRealtimeEvent.execute({
      tenantId: command.event.payload.tenantId,
      workspaceId: command.event.payload.workspaceId,
      channel,
      eventType: 'summary.status.changed.v1',
      resourceType: 'summary',
      resourceId: command.event.payload.summaryId,
      correlationId: command.event.correlationId,
      payload: {
        summaryJobId: command.event.payload.summaryJobId,
        summaryId: command.event.payload.summaryId,
        tenantId: command.event.payload.tenantId,
        workspaceId: command.event.payload.workspaceId,
        topicId: command.event.payload.topicId,
        status: command.event.payload.status,
      },
    });

    if (!result.ok) {
      return result;
    }

    return ok({
      realtimeEventId: result.value.eventId,
      channel,
      sequence: result.value.sequence,
    });
  }
}
