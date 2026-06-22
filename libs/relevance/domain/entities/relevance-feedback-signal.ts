import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type RelevanceFeedbackAction =
  | 'more_like_this'
  | 'less_like_this'
  | 'hide_source'
  | 'dismiss'
  | 'save';

export type RelevanceFeedbackTarget = {
  readonly feedItemId?: string;
  readonly topicId: string;
  readonly providerKey: string;
  readonly title: string;
  readonly bodyPreview?: string;
  readonly canonicalUrl?: string;
};

export type RelevanceFeedbackSignalProps = {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly userId: string;
  readonly idempotencyKey: string;
  readonly action: RelevanceFeedbackAction;
  readonly rating?: number;
  readonly target: RelevanceFeedbackTarget;
  readonly createdAt: Date;
};

const supportedActions = new Set<RelevanceFeedbackAction>([
  'more_like_this',
  'less_like_this',
  'hide_source',
  'dismiss',
  'save',
]);

export class RelevanceFeedbackSignal {
  private constructor(private readonly props: RelevanceFeedbackSignalProps) {}

  static record(props: RelevanceFeedbackSignalProps): RelevanceFeedbackSignal {
    const normalized = normalizeProps(props);

    return new RelevanceFeedbackSignal(normalized);
  }

  static rehydrate(props: RelevanceFeedbackSignalProps): RelevanceFeedbackSignal {
    return RelevanceFeedbackSignal.record(props);
  }

  toSnapshot(): RelevanceFeedbackSignalProps {
    return { ...this.props };
  }
}

export const relevanceFeedbackDirection = (
  action: RelevanceFeedbackAction,
  rating: number | undefined,
): 'positive' | 'negative' | 'block_provider' => {
  if (action === 'hide_source') {
    return 'block_provider';
  }

  if (action === 'more_like_this' || action === 'save' || (rating !== undefined && rating >= 4)) {
    return 'positive';
  }

  return 'negative';
};

const normalizeProps = (props: RelevanceFeedbackSignalProps): RelevanceFeedbackSignalProps => {
  const userId = props.userId.trim();
  const idempotencyKey = props.idempotencyKey.trim();
  const target = normalizeTarget(props.target);

  if (props.id.trim().length === 0) {
    throw new Error('Relevance feedback id must be non-empty');
  }

  if (userId.length === 0) {
    throw new Error('Relevance feedback user id must be non-empty');
  }

  if (idempotencyKey.length === 0) {
    throw new Error('Relevance feedback idempotency key must be non-empty');
  }

  if (!supportedActions.has(props.action)) {
    throw new Error('Relevance feedback action is unsupported');
  }

  if (props.rating !== undefined && (!Number.isInteger(props.rating) || props.rating < 1 || props.rating > 5)) {
    throw new Error('Relevance feedback rating must be an integer between 1 and 5');
  }

  return {
    ...props,
    userId,
    idempotencyKey,
    target,
  };
};

const normalizeTarget = (target: RelevanceFeedbackTarget): RelevanceFeedbackTarget => {
  if (target.topicId.trim().length === 0) {
    throw new Error('Relevance feedback topic id must be non-empty');
  }

  if (target.providerKey.trim().length === 0) {
    throw new Error('Relevance feedback provider key must be non-empty');
  }

  if (target.title.trim().length === 0 && (target.bodyPreview ?? '').trim().length === 0) {
    throw new Error('Relevance feedback target requires title or bodyPreview');
  }

  return {
    feedItemId: normalizeOptional(target.feedItemId),
    topicId: target.topicId.trim(),
    providerKey: target.providerKey.trim().toLocaleLowerCase('en-US'),
    title: target.title.trim(),
    bodyPreview: normalizeOptional(target.bodyPreview),
    canonicalUrl: normalizeOptional(target.canonicalUrl),
  };
};

const normalizeOptional = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();

  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
};
