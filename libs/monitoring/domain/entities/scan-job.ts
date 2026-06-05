import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ScanJobStatus = 'requested';

export type ScanJobProps = {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly status: ScanJobStatus;
  readonly idempotencyKey: string;
  readonly requestedAt: Date;
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

  toSnapshot(): ScanJobProps {
    return { ...this.props };
  }
}
