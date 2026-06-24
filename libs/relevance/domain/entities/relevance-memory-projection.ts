import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type {
  RelevanceFeedbackAction,
  RelevanceFeedbackTarget,
} from './relevance-feedback-signal';

export type RelevanceMemoryProjectionStatus = 'pending' | 'projected' | 'failed';
export type RelevanceMemoryLearningDirection = 'positive' | 'negative' | 'block_provider';

export type RelevanceMemoryProjectionProps = {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly feedbackId: string;
  readonly userId: string;
  readonly idempotencyKey: string;
  readonly action: RelevanceFeedbackAction;
  readonly rating?: number;
  readonly target: RelevanceFeedbackTarget;
  readonly learningDirection: RelevanceMemoryLearningDirection;
  readonly status: RelevanceMemoryProjectionStatus;
  readonly retryCount: number;
  readonly nextAttemptAt: Date;
  readonly projectedAt?: Date;
  readonly lastError?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

const retryBaseDelayMs = 60_000;
const maxErrorLength = 500;

export class RelevanceMemoryProjection {
  private constructor(private readonly props: RelevanceMemoryProjectionProps) {}

  static enqueue(props: Omit<RelevanceMemoryProjectionProps, 'status' | 'retryCount' | 'nextAttemptAt' | 'createdAt' | 'updatedAt'> & {
    readonly createdAt: Date;
  }): RelevanceMemoryProjection {
    return RelevanceMemoryProjection.rehydrate({
      ...props,
      status: 'pending',
      retryCount: 0,
      nextAttemptAt: props.createdAt,
      updatedAt: props.createdAt,
    });
  }

  static rehydrate(props: RelevanceMemoryProjectionProps): RelevanceMemoryProjection {
    const normalized = normalizeProps(props);

    return new RelevanceMemoryProjection(normalized);
  }

  markProjected(projectedAt: Date): RelevanceMemoryProjection {
    return RelevanceMemoryProjection.rehydrate({
      ...this.props,
      status: 'projected',
      projectedAt,
      lastError: undefined,
      updatedAt: projectedAt,
    });
  }

  markFailed(error: string, failedAt: Date): RelevanceMemoryProjection {
    const retryCount = this.props.retryCount + 1;

    return RelevanceMemoryProjection.rehydrate({
      ...this.props,
      status: 'failed',
      retryCount,
      nextAttemptAt: new Date(failedAt.getTime() + retryDelayMs(retryCount)),
      lastError: error.slice(0, maxErrorLength),
      updatedAt: failedAt,
    });
  }

  toSnapshot(): RelevanceMemoryProjectionProps {
    return { ...this.props };
  }
}

export const createRelevanceMemoryProjection = (props: {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly feedbackId: string;
  readonly userId: string;
  readonly idempotencyKey: string;
  readonly action: RelevanceFeedbackAction;
  readonly rating?: number;
  readonly target: RelevanceFeedbackTarget;
  readonly learningDirection: RelevanceMemoryLearningDirection;
  readonly createdAt: Date;
}): RelevanceMemoryProjection => RelevanceMemoryProjection.enqueue(props);

const normalizeProps = (props: RelevanceMemoryProjectionProps): RelevanceMemoryProjectionProps => {
  const userId = props.userId.trim();
  const idempotencyKey = props.idempotencyKey.trim();

  if (props.id.trim().length === 0) throw new Error('Relevance memory projection id must be non-empty');
  if (props.feedbackId.trim().length === 0) throw new Error('Relevance memory projection feedbackId must be non-empty');
  if (userId.length === 0) throw new Error('Relevance memory projection userId must be non-empty');
  if (idempotencyKey.length === 0) throw new Error('Relevance memory projection idempotencyKey must be non-empty');
  if (!['pending', 'projected', 'failed'].includes(props.status)) {
    throw new Error('Relevance memory projection status is unsupported');
  }
  if (!Number.isInteger(props.retryCount) || props.retryCount < 0) {
    throw new Error('Relevance memory projection retryCount must be a non-negative integer');
  }
  if (props.updatedAt.getTime() < props.createdAt.getTime()) {
    throw new Error('Relevance memory projection updatedAt must not be before createdAt');
  }

  return {
    ...props,
    userId,
    idempotencyKey,
    lastError: normalizeOptional(props.lastError),
  };
};

const retryDelayMs = (retryCount: number): number =>
  Math.min(retryBaseDelayMs * (2 ** Math.max(0, retryCount - 1)), 3_600_000);

const normalizeOptional = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();

  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
};
