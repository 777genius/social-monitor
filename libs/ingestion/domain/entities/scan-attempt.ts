import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ScanAttemptStatus = 'running' | 'succeeded' | 'failed';

export type ScanAttemptProps = {
  readonly scanJobId: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly sourceBindingId: string;
  readonly status: ScanAttemptStatus;
  readonly startedAt: Date;
  readonly finishedAt?: Date;
  readonly fetched: number;
  readonly inserted: number;
  readonly skippedDuplicates: number;
  readonly projected: number;
  readonly failureReason?: string;
};

export class ScanAttempt {
  private constructor(private readonly props: ScanAttemptProps) {}

  static start(props: Omit<ScanAttemptProps, 'status' | 'finishedAt' | 'fetched' | 'inserted' | 'skippedDuplicates' | 'projected' | 'failureReason'>): ScanAttempt {
    if (props.scanJobId.trim().length === 0) {
      throw new Error('Scan job id must be non-empty');
    }

    if (props.sourceBindingId.trim().length === 0) {
      throw new Error('Source binding id must be non-empty');
    }

    return new ScanAttempt({
      ...props,
      status: 'running',
      fetched: 0,
      inserted: 0,
      skippedDuplicates: 0,
      projected: 0,
    });
  }

  succeed(props: {
    readonly finishedAt: Date;
    readonly fetched: number;
    readonly inserted: number;
    readonly skippedDuplicates: number;
    readonly projected: number;
  }): ScanAttempt {
    return new ScanAttempt({
      ...this.props,
      status: 'succeeded',
      finishedAt: props.finishedAt,
      fetched: props.fetched,
      inserted: props.inserted,
      skippedDuplicates: props.skippedDuplicates,
      projected: props.projected,
      failureReason: undefined,
    });
  }

  fail(props: { readonly finishedAt: Date; readonly failureReason: string }): ScanAttempt {
    return new ScanAttempt({
      ...this.props,
      status: 'failed',
      finishedAt: props.finishedAt,
      failureReason: props.failureReason,
    });
  }

  toSnapshot(): ScanAttemptProps {
    return { ...this.props };
  }
}
