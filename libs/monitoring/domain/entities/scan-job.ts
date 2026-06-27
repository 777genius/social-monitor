import { emptyJsonObjectAsUndefined, normalizeJsonObject, type JsonObject, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';

export type ScanJobStatus = 'requested' | 'enqueued' | 'succeeded' | 'failed';
export type ScanJobFailureMetadata = JsonObject;

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
  readonly failureMetadata?: ScanJobFailureMetadata;
};

export class ScanJob {
  private constructor(private readonly props: ScanJobProps) {}

  static request(props: Omit<ScanJobProps, 'status'>): ScanJob {
    this.assertRequiredIds(props.sourceBindingId, props.scanPolicyId);

    return new ScanJob({
      ...props,
      status: 'requested',
      failureReason: props.failureReason?.trim(),
      failureMetadata: normalizeFailureMetadata(props.failureMetadata),
    });
  }

  static rehydrate(props: ScanJobProps): ScanJob {
    this.assertRequiredIds(props.sourceBindingId, props.scanPolicyId);

    if (props.status === 'enqueued' && props.enqueuedAt === undefined) {
      throw new Error('Enqueued scan jobs must have enqueue time');
    }

    if ((props.status === 'succeeded' || props.status === 'failed') && props.completedAt === undefined) {
      throw new Error('Completed scan jobs must have completion time');
    }

    if (props.status === 'failed' && (props.failureReason ?? '').trim().length === 0) {
      throw new Error('Failed scan jobs must have failure reason');
    }

    if (props.enqueuedAt !== undefined && props.enqueuedAt.getTime() < props.requestedAt.getTime()) {
      throw new Error('Scan job enqueue time cannot be before request time');
    }

    if (
      props.completedAt !== undefined &&
      props.enqueuedAt !== undefined &&
      props.completedAt.getTime() < props.enqueuedAt.getTime()
    ) {
      throw new Error('Scan job completion time cannot be before enqueue time');
    }

    return new ScanJob({
      ...props,
      failureReason: props.failureReason?.trim(),
      failureMetadata: normalizeFailureMetadata(props.failureMetadata),
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
      failureReason: undefined,
      failureMetadata: undefined,
    });
  }

  markFailed(params: {
    readonly completedAt: Date;
    readonly failureReason: string;
    readonly failureMetadata?: ScanJobFailureMetadata;
  }): ScanJob {
    this.assertCanComplete(params.completedAt);

    if (params.failureReason.trim().length === 0) {
      throw new Error('Scan job failure reason must be non-empty');
    }

    return new ScanJob({
      ...this.props,
      status: 'failed',
      completedAt: params.completedAt,
      failureReason: params.failureReason.trim(),
      failureMetadata: normalizeFailureMetadata(params.failureMetadata),
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

  private static assertRequiredIds(sourceBindingId: string, scanPolicyId: string): void {
    if (sourceBindingId.trim().length === 0) {
      throw new Error('Source binding id must be non-empty');
    }

    if (scanPolicyId.trim().length === 0) {
      throw new Error('Scan policy id must be non-empty');
    }
  }
}

const normalizeFailureMetadata = (
  metadata: ScanJobFailureMetadata | undefined,
): ScanJobFailureMetadata | undefined =>
  emptyJsonObjectAsUndefined(normalizeJsonObject(metadata));
