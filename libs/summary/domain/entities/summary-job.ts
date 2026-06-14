import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type SummaryJobStatus = 'requested' | 'running' | 'completed' | 'no_signal' | 'failed';

export type SummaryJobProps = {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly topicId: string;
  readonly status: SummaryJobStatus;
  readonly idempotencyKey: string;
  readonly requestedAt: Date;
  readonly startedAt?: Date;
  readonly completedAt?: Date;
  readonly failedAt?: Date;
  readonly summaryId?: string;
  readonly failureReason?: string;
};

export class SummaryJob {
  private constructor(private readonly props: SummaryJobProps) {}

  static request(props: Omit<SummaryJobProps, 'status'>): SummaryJob {
    this.assertTopic(props.topicId);

    return new SummaryJob({
      ...props,
      status: 'requested',
    });
  }

  static rehydrate(props: SummaryJobProps): SummaryJob {
    this.assertTopic(props.topicId);

    if ((props.status === 'completed' || props.status === 'no_signal') && props.summaryId === undefined) {
      throw new Error('Completed summary job must reference a summary artifact');
    }

    if (props.status === 'running' && props.startedAt === undefined) {
      throw new Error('Running summary job must have start time');
    }

    if ((props.status === 'completed' || props.status === 'no_signal') && props.completedAt === undefined) {
      throw new Error('Completed summary job must have completion time');
    }

    if (
      props.status === 'failed' &&
      ((props.failureReason ?? '').trim().length === 0 || props.failedAt === undefined)
    ) {
      throw new Error('Failed summary job must include failure time and reason');
    }

    return new SummaryJob({
      ...props,
      failureReason: props.failureReason?.trim(),
    });
  }

  start(params: { readonly startedAt: Date }): SummaryJob {
    if (this.props.status !== 'requested') {
      throw new Error('Summary job can only start from requested status');
    }

    return new SummaryJob({
      ...this.props,
      status: 'running',
      startedAt: params.startedAt,
    });
  }

  complete(params: { readonly completedAt: Date; readonly summaryId: string }): SummaryJob {
    if (this.props.status !== 'running') {
      throw new Error('Summary job can only complete from running status');
    }

    if (params.summaryId.trim().length === 0) {
      throw new Error('Completed summary job must reference a summary artifact');
    }

    return new SummaryJob({
      ...this.props,
      status: 'completed',
      completedAt: params.completedAt,
      summaryId: params.summaryId,
    });
  }

  markNoSignal(params: { readonly completedAt: Date; readonly summaryId: string }): SummaryJob {
    if (this.props.status !== 'running') {
      throw new Error('Summary job can only become no_signal from running status');
    }

    if (params.summaryId.trim().length === 0) {
      throw new Error('No-signal summary job must reference a summary artifact');
    }

    return new SummaryJob({
      ...this.props,
      status: 'no_signal',
      completedAt: params.completedAt,
      summaryId: params.summaryId,
    });
  }

  fail(params: { readonly failedAt: Date; readonly failureReason: string }): SummaryJob {
    if (this.props.status !== 'running') {
      throw new Error('Summary job can only fail from running status');
    }

    if (params.failureReason.trim().length === 0) {
      throw new Error('Failed summary job must include failure reason');
    }

    return new SummaryJob({
      ...this.props,
      status: 'failed',
      failedAt: params.failedAt,
      failureReason: params.failureReason,
    });
  }

  retry(params: { readonly requestedAt: Date }): SummaryJob {
    if (this.props.status !== 'failed') {
      throw new Error('Summary job can only retry from failed status');
    }

    return new SummaryJob({
      id: this.props.id,
      tenantId: this.props.tenantId,
      workspaceId: this.props.workspaceId,
      topicId: this.props.topicId,
      status: 'requested',
      idempotencyKey: this.props.idempotencyKey,
      requestedAt: params.requestedAt,
    });
  }

  toSnapshot(): SummaryJobProps {
    return { ...this.props };
  }

  private static assertTopic(topicId: string): void {
    if (topicId.trim().length === 0) {
      throw new Error('Summary topic id must be non-empty');
    }
  }
}
