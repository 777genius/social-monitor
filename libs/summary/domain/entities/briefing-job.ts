import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { BriefingScope } from '../value-objects/briefing-scope';
import { assertBriefingScope, sameBriefingScope } from '../value-objects/briefing-scope';

export type BriefingJobStatus = 'requested' | 'running' | 'completed' | 'no_signal' | 'failed';

export type BriefingJobProps = {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope: BriefingScope;
  readonly userId?: string;
  readonly subscriptionId?: string;
  readonly status: BriefingJobStatus;
  readonly idempotencyKey: string;
  readonly requestedAt: Date;
  readonly startedAt?: Date;
  readonly completedAt?: Date;
  readonly failedAt?: Date;
  readonly briefingId?: string;
  readonly failureReason?: string;
};

export class BriefingJob {
  private constructor(private readonly props: BriefingJobProps) {}

  static request(props: Omit<BriefingJobProps, 'status'>): BriefingJob {
    this.assertValidRequest(props);

    return new BriefingJob({
      ...props,
      status: 'requested',
    });
  }

  static rehydrate(props: BriefingJobProps): BriefingJob {
    this.assertValidRequest(props);

    if ((props.status === 'completed' || props.status === 'no_signal') && props.briefingId === undefined) {
      throw new Error('Completed briefing job must reference a briefing artifact');
    }

    if (props.status === 'running' && props.startedAt === undefined) {
      throw new Error('Running briefing job must have start time');
    }

    if ((props.status === 'completed' || props.status === 'no_signal') && props.completedAt === undefined) {
      throw new Error('Completed briefing job must have completion time');
    }

    if (
      props.status === 'failed' &&
      ((props.failureReason ?? '').trim().length === 0 || props.failedAt === undefined)
    ) {
      throw new Error('Failed briefing job must include failure time and reason');
    }

    return new BriefingJob({
      ...props,
      failureReason: props.failureReason?.trim(),
    });
  }

  start(params: { readonly startedAt: Date }): BriefingJob {
    if (this.props.status !== 'requested') {
      throw new Error('Briefing job can only start from requested status');
    }

    return new BriefingJob({
      ...this.props,
      status: 'running',
      startedAt: params.startedAt,
    });
  }

  complete(params: { readonly completedAt: Date; readonly briefingId: string }): BriefingJob {
    if (this.props.status !== 'running') {
      throw new Error('Briefing job can only complete from running status');
    }

    assertBriefingId(params.briefingId);

    return new BriefingJob({
      ...this.props,
      status: 'completed',
      completedAt: params.completedAt,
      briefingId: params.briefingId,
    });
  }

  markNoSignal(params: { readonly completedAt: Date; readonly briefingId: string }): BriefingJob {
    if (this.props.status !== 'running') {
      throw new Error('Briefing job can only become no_signal from running status');
    }

    assertBriefingId(params.briefingId);

    return new BriefingJob({
      ...this.props,
      status: 'no_signal',
      completedAt: params.completedAt,
      briefingId: params.briefingId,
    });
  }

  fail(params: { readonly failedAt: Date; readonly failureReason: string }): BriefingJob {
    if (this.props.status !== 'running') {
      throw new Error('Briefing job can only fail from running status');
    }

    if (params.failureReason.trim().length === 0) {
      throw new Error('Failed briefing job must include failure reason');
    }

    return new BriefingJob({
      ...this.props,
      status: 'failed',
      failedAt: params.failedAt,
      failureReason: params.failureReason.trim(),
    });
  }

  retry(params: { readonly requestedAt: Date }): BriefingJob {
    if (this.props.status !== 'failed') {
      throw new Error('Briefing job can only retry from failed status');
    }

    return new BriefingJob({
      id: this.props.id,
      tenantId: this.props.tenantId,
      workspaceId: this.props.workspaceId,
      scope: this.props.scope,
      userId: this.props.userId,
      subscriptionId: this.props.subscriptionId,
      status: 'requested',
      idempotencyKey: this.props.idempotencyKey,
      requestedAt: params.requestedAt,
    });
  }

  isSameRequest(params: {
    readonly scope: BriefingScope;
    readonly userId?: string;
    readonly subscriptionId?: string;
  }): boolean {
    return (
      sameBriefingScope(this.props.scope, params.scope) &&
      this.props.userId === params.userId &&
      this.props.subscriptionId === params.subscriptionId
    );
  }

  toSnapshot(): BriefingJobProps {
    return { ...this.props };
  }

  private static assertValidRequest(props: Omit<BriefingJobProps, 'status'> | BriefingJobProps): void {
    if (props.id.trim().length === 0) {
      throw new Error('Briefing job id must be non-empty');
    }

    assertBriefingScope(props.scope);

    if (props.idempotencyKey.trim().length === 0) {
      throw new Error('Briefing job idempotency key must be non-empty');
    }

    if ((props.userId ?? '').trim().length === 0 && props.subscriptionId !== undefined) {
      throw new Error('Subscription-scoped briefing job must include user id');
    }
  }
}

const assertBriefingId = (briefingId: string): void => {
  if (briefingId.trim().length === 0) {
    throw new Error('Completed briefing job must reference a briefing artifact');
  }
};
