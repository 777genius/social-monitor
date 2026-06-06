import type { CorrelationId, TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type RealtimeResourceType = 'workspace' | 'topic' | 'source_binding' | 'summary' | 'scan';

export type RealtimeEventProps = {
  readonly id: string;
  readonly protocolVersion: 1;
  readonly eventType: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly channel: string;
  readonly resourceType: RealtimeResourceType;
  readonly resourceId: string;
  readonly sequence: number;
  readonly replayCursor: string;
  readonly occurredAt: Date;
  readonly correlationId: CorrelationId;
  readonly payload: Readonly<Record<string, unknown>>;
};

export class RealtimeEvent {
  private constructor(private readonly props: RealtimeEventProps) {}

  static create(props: RealtimeEventProps): RealtimeEvent {
    if (props.eventType.trim().length === 0) {
      throw new Error('Realtime event type must be non-empty');
    }

    if (props.channel.trim().length === 0) {
      throw new Error('Realtime channel must be non-empty');
    }

    if (props.resourceId.trim().length === 0) {
      throw new Error('Realtime resource id must be non-empty');
    }

    if (!Number.isInteger(props.sequence) || props.sequence < 1) {
      throw new Error('Realtime sequence must be a positive integer');
    }

    if (props.replayCursor.trim().length === 0) {
      throw new Error('Realtime replay cursor must be non-empty');
    }

    return new RealtimeEvent(props);
  }

  toSnapshot(): RealtimeEventProps {
    return { ...this.props };
  }
}
