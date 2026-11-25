import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { RealtimeEventRepositoryPort } from '../../ports';
import type { ListRealtimeEventsUseCaseQuery } from './list-realtime-events.query';
import type { ListRealtimeEventsResult } from './list-realtime-events.result';

type ListRealtimeEventsFailure = DomainError;

const MAX_LIMIT = 100;

export class ListRealtimeEventsUseCase {
  constructor(private readonly realtimeEvents: RealtimeEventRepositoryPort) {}

  async execute(
    query: ListRealtimeEventsUseCaseQuery,
  ): Promise<Result<ListRealtimeEventsResult, ListRealtimeEventsFailure>> {
    if (query.channel.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Realtime channel must be non-empty'));
    }

    if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > MAX_LIMIT) {
      return err(new DomainError('validation.failed', 'Realtime event page limit must be between 1 and 100', {
        limit: query.limit,
      }));
    }

    const result = await this.realtimeEvents.list(query);

    return ok({
      events: result.events.map((event) => {
        const snapshot = event.toSnapshot();

        return {
          ...snapshot,
          tenantId: snapshot.tenantId,
          workspaceId: snapshot.workspaceId,
          correlationId: snapshot.correlationId,
          occurredAt: snapshot.occurredAt.toISOString(),
        };
      }),
      nextCursor: result.nextCursor,
      resyncRequired: result.resyncRequired,
    });
  }
}
