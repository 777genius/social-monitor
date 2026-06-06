import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ScanJobStatus = 'requested' | 'enqueued' | 'succeeded' | 'failed';

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
  readonly completedAt?: Date;
  readonly failureReason?: string;
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

  markSucceeded(params: { readonly completedAt: Date }): ScanJob {
    this.assertCanComplete(params.completedAt);

    return new ScanJob({
      ...this.props,
      status: 'succeeded',
      completedAt: params.completedAt,
    });
  }

  markFailed(params: { readonly completedAt: Date; readonly failureReason: string }): ScanJob {
    this.assertCanComplete(params.completedAt);

    if (params.failureReason.trim().length === 0) {
      throw new Error('Scan job failure reason must be non-empty');
    }

    return new ScanJob({
      ...this.props,
      status: 'failed',
      completedAt: params.completedAt,
      failureReason: params.failureReason.trim(),
    });
  }

  toSnapshot(): ScanJobProps {
    return { ...this.props };
  }

  private assertCanComplete(completedAt: Date): void {
    if (this.props.status !== 'enqueued') {
      throw new Error('Only enqueued scan jobs can complete');
    }

    if (this.props.enqueuedAt !== undefined && completedAt.getTime() < this.props.enqueuedAt.getTime()) {
      throw new Error('Scan job completion time cannot be before enqueue time');
    }
  }
}
