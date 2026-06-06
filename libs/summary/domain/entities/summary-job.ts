import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type SummaryJobStatus = 'requested';

export type SummaryJobProps = {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly topicId: string;
  readonly status: SummaryJobStatus;
  readonly idempotencyKey: string;
  readonly requestedAt: Date;
};

export class SummaryJob {
  private constructor(private readonly props: SummaryJobProps) {}

  static request(props: Omit<SummaryJobProps, 'status'>): SummaryJob {
    if (props.topicId.trim().length === 0) {
      throw new Error('Summary topic id must be non-empty');
    }

    return new SummaryJob({
      ...props,
      status: 'requested',
    });
  }

  toSnapshot(): SummaryJobProps {
    return { ...this.props };
  }
}
