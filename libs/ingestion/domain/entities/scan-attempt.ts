import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ScanAttemptStatus = 'running' | 'succeeded' | 'failed';

export type ScanAttemptProps = {
  readonly scanJobId: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly sourceBindingId: string;
  readonly attemptNumber: number;
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

  static start(
    props: Omit<
      ScanAttemptProps,
      'status' | 'finishedAt' | 'fetched' | 'inserted' | 'skippedDuplicates' | 'projected' | 'failureReason'
    >,
  ): ScanAttempt {
    return this.rehydrate({
      ...props,
      status: 'running',
      fetched: 0,
      inserted: 0,
      skippedDuplicates: 0,
      projected: 0,
    });
  }

  static rehydrate(props: ScanAttemptProps): ScanAttempt {
    this.assertValid(props);

    return new ScanAttempt({
      ...props,
      failureReason: props.failureReason?.trim(),
    });
  }

  succeed(props: {
    readonly finishedAt: Date;
    readonly fetched: number;
    readonly inserted: number;
    readonly skippedDuplicates: number;
    readonly projected: number;
  }): ScanAttempt {
    return ScanAttempt.rehydrate({
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
    return ScanAttempt.rehydrate({
      ...this.props,
      status: 'failed',
      finishedAt: props.finishedAt,
      failureReason: props.failureReason,
    });
  }

  toSnapshot(): ScanAttemptProps {
    return { ...this.props };
  }

  private static assertValid(props: ScanAttemptProps): void {
    if (props.scanJobId.trim().length === 0) {
      throw new Error('Scan job id must be non-empty');
    }

    if (props.sourceBindingId.trim().length === 0) {
      throw new Error('Source binding id must be non-empty');
    }

    if (!Number.isInteger(props.attemptNumber) || props.attemptNumber < 1) {
      throw new Error('Scan attempt number must be a positive integer');
    }

    for (const value of [props.fetched, props.inserted, props.skippedDuplicates, props.projected]) {
      if (!Number.isInteger(value) || value < 0) {
        throw new Error('Scan attempt counters must be non-negative integers');
      }
    }

    if (props.status === 'running' && props.finishedAt !== undefined) {
      throw new Error('Running scan attempt must not have finish time');
    }

    if ((props.status === 'succeeded' || props.status === 'failed') && props.finishedAt === undefined) {
      throw new Error('Finished scan attempt must include finish time');
    }

    if (props.status === 'failed' && (props.failureReason ?? '').trim().length === 0) {
      throw new Error('Failed scan attempt must include failure reason');
    }
  }
}
