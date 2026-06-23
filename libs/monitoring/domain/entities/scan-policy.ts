import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ScanPolicyProps = {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly sourceBindingId: string;
  readonly intervalSeconds: number;
  readonly freshnessSeconds: number;
  readonly retryBudget: number;
  readonly nextRunAt: Date;
  readonly createdAt: Date;
};

export class ScanPolicy {
  private constructor(private readonly props: ScanPolicyProps) {}

  static create(props: ScanPolicyProps): ScanPolicy {
    this.assertValid(props);

    return new ScanPolicy(props);
  }

  static rehydrate(props: ScanPolicyProps): ScanPolicy {
    return new ScanPolicy(props);
  }

  reconfigure(params: {
    readonly intervalSeconds: number;
    readonly freshnessSeconds: number;
    readonly retryBudget: number;
    readonly nextRunAt: Date;
  }): ScanPolicy {
    return ScanPolicy.create({
      ...this.props,
      intervalSeconds: params.intervalSeconds,
      freshnessSeconds: params.freshnessSeconds,
      retryBudget: params.retryBudget,
      nextRunAt: params.nextRunAt,
    });
  }

  hasConfiguration(params: {
    readonly intervalSeconds: number;
    readonly freshnessSeconds: number;
    readonly retryBudget: number;
  }): boolean {
    return this.props.intervalSeconds === params.intervalSeconds &&
      this.props.freshnessSeconds === params.freshnessSeconds &&
      this.props.retryBudget === params.retryBudget;
  }

  scheduleNext(params: { readonly nextRunAt: Date }): ScanPolicy {
    if (params.nextRunAt.getTime() <= this.props.nextRunAt.getTime()) {
      throw new Error('Next scan run must move forward');
    }

    return new ScanPolicy({
      ...this.props,
      nextRunAt: params.nextRunAt,
    });
  }

  toSnapshot(): ScanPolicyProps {
    return { ...this.props };
  }

  private static assertValid(props: ScanPolicyProps): void {
    if (!Number.isInteger(props.intervalSeconds) || props.intervalSeconds < 60) {
      throw new Error('Scan interval must be at least 60 seconds');
    }

    if (!Number.isInteger(props.freshnessSeconds) || props.freshnessSeconds < props.intervalSeconds) {
      throw new Error('Freshness target must be greater than or equal to scan interval');
    }

    if (!Number.isInteger(props.retryBudget) || props.retryBudget < 0 || props.retryBudget > 10) {
      throw new Error('Retry budget must be between 0 and 10');
    }
  }
}
