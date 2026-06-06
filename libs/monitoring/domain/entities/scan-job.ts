import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ScanJobStatus = 'requested' | 'enqueued';

export type ScanJobProps = {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly status: ScanJobStatus;
  readonly idempotencyKey: string;
  readonly requestedAt: Date;
  readonly enqueuedAt?: Date;
};

export class ScanJob {
  private constructor(private readonly props: ScanJobProps) {}

  static request(props: Omit<ScanJobProps, 'status'>): ScanJob {
    if (props.sourceBindingId.trim().length === 0) {
      throw new Error('Source binding id must be non-empty');
    }

    if (props.scanPolicyId.trim().length === 0) {
      throw new Error('Scan policy id must be non-empty');
    }

    return new ScanJob({
      ...props,
      status: 'requested',
    });
  }

  markEnqueued(params: { readonly enqueuedAt: Date }): ScanJob {
    if (this.props.status !== 'requested') {
      throw new Error('Only requested scan jobs can be enqueued');
    }

    if (params.enqueuedAt.getTime() < this.props.requestedAt.getTime()) {
      throw new Error('Scan job enqueue time cannot be before request time');
    }

    return new ScanJob({
      ...this.props,
      status: 'enqueued',
      enqueuedAt: params.enqueuedAt,
    });
  }

  toSnapshot(): ScanJobProps {
    return { ...this.props };
  }
}
