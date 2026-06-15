import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { RealtimeEvent } from '../domain';

export type ListRealtimeEventsQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly channel: string;
  readonly limit: number;
  readonly cursor?: string;
};

export type ListRealtimeEventsResult = {
  readonly events: readonly RealtimeEvent[];
  readonly nextCursor?: string;
  readonly resyncRequired: boolean;
};

export interface RealtimeEventRepositoryPort {
  nextSequence(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    channel: string;
  }): Promise<number>;
  append(event: RealtimeEvent): Promise<void>;
  list(query: ListRealtimeEventsQuery): Promise<ListRealtimeEventsResult>;
}

export class RealtimeEventSequenceConflictError extends Error {
  constructor() {
    super('Realtime event sequence already exists for channel');
    this.name = 'RealtimeEventSequenceConflictError';
  }
}
