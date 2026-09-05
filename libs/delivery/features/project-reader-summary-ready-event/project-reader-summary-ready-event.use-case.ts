import { err, ok, type Result } from '@social-monitor/shared-kernel';
import type { ReaderSummaryReadyProjectionStore } from '../../application/contracts/reader-summary-ready-projection-store';
import { assertReaderSummaryReadyProjection, type ReaderSummaryReadyProjectionEvent } from '../../domain/reader-summary-ready-projection';

export type ProjectReaderSummaryReadyResult = Awaited<ReturnType<ReaderSummaryReadyProjectionStore['project']>>;

export class ProjectReaderSummaryReadyEventUseCase {
  constructor(private readonly projections: ReaderSummaryReadyProjectionStore) {}

  async execute(command: { readonly event: ReaderSummaryReadyProjectionEvent }): Promise<Result<ProjectReaderSummaryReadyResult, Error>> {
    try {
      const { event } = command;
      assertReaderSummaryReadyProjection(event);
      const { payload } = event;
      const interest = payload.scope.type === 'interest';
      const resourceId = payload.scope.type === 'interest' ? payload.scope.interestId : payload.workspaceId;
      return ok(await this.projections.project({
        sourceEventId: event.eventId,
        protocolVersion: 1,
        eventType: 'reader_summary.status.changed.v1',
        tenantId: payload.tenantId,
        workspaceId: payload.workspaceId,
        channel: `${interest ? 'interest' : 'workspace'}:${resourceId}:summary-status`,
        resourceType: interest ? 'interest' : 'workspace',
        resourceId,
        correlationId: event.correlationId,
        occurredAt: event.occurredAt,
        payload: {
          readerSummaryId: payload.readerSummaryId,
          readerSummaryJobId: payload.readerSummaryJobId,
          status: payload.status,
          scope: payload.scope.type === 'interest'
            ? { type: 'interest', interestId: payload.scope.interestId } : { type: 'workspace' },
          period: {
            cadence: payload.period.cadence,
            startedAt: payload.period.startedAt.toISOString(),
            endedAt: payload.period.endedAt.toISOString(),
            timezone: payload.period.timezone,
            periodKey: payload.period.periodKey,
          },
        },
      }));
    } catch (error) {
      return err(error instanceof Error ? error : new Error('Reader summary projection failed'));
    }
  }
}
