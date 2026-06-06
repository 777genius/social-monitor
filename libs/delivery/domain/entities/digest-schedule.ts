import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { DeliveryChannel } from './delivery-attempt';

export type DigestScheduleStatus = 'enabled' | 'disabled';

export type DigestScheduleProps = {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly recipientKey: string;
  readonly channel: DeliveryChannel;
  readonly topicIds: readonly string[];
  readonly intervalSeconds: number;
  readonly includeNoSignal: boolean;
  readonly nextRunAt: Date;
  readonly createdAt: Date;
  readonly status: DigestScheduleStatus;
};

export class DigestSchedule {
  private constructor(private readonly props: DigestScheduleProps) {}

  static create(props: Omit<DigestScheduleProps, 'status'> & { readonly status?: DigestScheduleStatus }): DigestSchedule {
    if (props.id.trim().length === 0) {
      throw new Error('Digest schedule id must be non-empty');
    }

    if (props.recipientKey.trim().length === 0) {
      throw new Error('Digest schedule recipient key must be non-empty');
    }

    if (props.topicIds.length === 0 || props.topicIds.some((topicId) => topicId.trim().length === 0)) {
      throw new Error('Digest schedule topic ids must be non-empty');
    }

    if (!Number.isInteger(props.intervalSeconds) || props.intervalSeconds < 60) {
      throw new Error('Digest schedule interval must be at least 60 seconds');
    }

    return new DigestSchedule({
      ...props,
      topicIds: [...new Set(props.topicIds)].sort((left, right) => left.localeCompare(right)),
      status: props.status ?? 'enabled',
    });
  }

  scheduleNext(params: { readonly nextRunAt: Date }): DigestSchedule {
    return new DigestSchedule({
      ...this.props,
      nextRunAt: params.nextRunAt,
    });
  }

  toSnapshot(): DigestScheduleProps {
    return { ...this.props };
  }
}
