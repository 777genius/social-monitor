import { createHash } from 'node:crypto';
import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { SummaryReadyProjectionStore } from '../../application/contracts/summary-ready-projection-store';
import type { RealtimeFanoutPort } from '../../ports';
import type { ProjectSummaryReadyEventCommand } from './project-summary-ready-event.command';

export type ProjectSummaryReadyEventResult = {
  readonly realtimeEventId: string;
  readonly channel: string;
  readonly sequence: number;
};

type ProjectSummaryReadyEventFailure = DomainError | Error;

export class ProjectSummaryReadyEventUseCase {
  constructor(
    private readonly projections: SummaryReadyProjectionStore,
    private readonly fanout: RealtimeFanoutPort,
  ) {}

  async execute(
    command: ProjectSummaryReadyEventCommand,
  ): Promise<Result<ProjectSummaryReadyEventResult, ProjectSummaryReadyEventFailure>> {
    try {
      const { event } = command;
      const { payload } = event;
      if (payload === null || typeof payload !== 'object' ||
          event.eventType !== 'summary.ready' || event.schemaVersion !== 1 ||
          event.tenantId !== payload.tenantId || event.workspaceId !== payload.workspaceId ||
          !nonempty(event.eventId) || !nonempty(event.tenantId) || !nonempty(event.workspaceId) ||
          !nonempty(event.correlationId) || !nonempty(event.causationId) ||
          !(event.occurredAt instanceof Date) || Number.isNaN(event.occurredAt.getTime()) ||
          !nonempty(payload.summaryJobId) || !nonempty(payload.summaryId) || !nonempty(payload.interestId) ||
          (payload.userId !== undefined && !nonempty(payload.userId)) ||
          (payload.subscriptionId !== undefined && !nonempty(payload.subscriptionId)) ||
          (payload.status !== 'completed' && payload.status !== 'no_signal')) {
        return err(new DomainError('validation.failed', 'Invalid summary.ready identity, scope or status'));
      }

      const channel = `interest:${payload.interestId}:summary-status`;
      const projected = await this.projections.project({
        sourceEventId: event.eventId,
        sourceIdentityHash: createHash('sha256').update(canonical({
          causationId: event.causationId, payload,
        })).digest('hex'),
        protocolVersion: 1,
        eventType: 'summary.status.changed.v1',
        tenantId: payload.tenantId,
        workspaceId: payload.workspaceId,
        channel,
        resourceType: 'summary',
        resourceId: payload.summaryId,
        correlationId: event.correlationId,
        occurredAt: event.occurredAt,
        payload: {
          summaryJobId: payload.summaryJobId,
          summaryId: payload.summaryId,
          tenantId: payload.tenantId,
          workspaceId: payload.workspaceId,
          interestId: payload.interestId,
          status: payload.status,
        },
      });

      // A broker retry republishes the committed identity to heal fanout loss.
      try {
        await this.fanout.publish(projected);
      } catch {
        // Fanout remains best effort; replay was durably committed above.
      }

      const snapshot = projected.toSnapshot();
      return ok({ realtimeEventId: snapshot.id, channel: snapshot.channel, sequence: snapshot.sequence });
    } catch (error) {
      return err(error instanceof Error ? error : new Error('Summary ready projection failed'));
    }
  }
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter(key =>
      (value as Record<string, unknown>)[key] !== undefined).map(key =>
      `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
