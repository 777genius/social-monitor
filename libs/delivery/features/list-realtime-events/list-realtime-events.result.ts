import type { RealtimeResourceType } from '../../domain';

export type RealtimeEventView = {
  readonly id: string;
  readonly protocolVersion: 1;
  readonly eventType: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly channel: string;
  readonly resourceType: RealtimeResourceType;
  readonly resourceId: string;
  readonly sequence: number;
  readonly replayCursor: string;
  readonly occurredAt: string;
  readonly correlationId: string;
  readonly payload: Readonly<Record<string, unknown>>;
};

export type ListRealtimeEventsResult = {
  readonly events: readonly RealtimeEventView[];
  readonly nextCursor?: string;
  readonly resyncRequired: boolean;
};
