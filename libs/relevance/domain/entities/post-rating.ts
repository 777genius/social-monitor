import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { RelevanceFeedbackSignal } from './relevance-feedback-signal';
import {
  normalizePostRatingReason,
  type PostRatingReason,
} from './post-rating-reason';

export const postRatingLearningEffects = ['negative', 'neutral', 'positive'] as const;

export type PostRatingLearningEffect = (typeof postRatingLearningEffects)[number];

export type PostRatingTarget = {
  readonly feedItemId?: string;
  readonly sourceItemId?: string;
  readonly interestId: string;
};

export type PostRatingRecordTarget = PostRatingTarget & {
  readonly providerKey: string;
  readonly title: string;
  readonly bodyPreview?: string;
  readonly canonicalUrl?: string;
};

export type PostRating = {
  readonly feedbackId: string;
  readonly userId: string;
  readonly rating: number;
  readonly target: PostRatingTarget;
  readonly ratedAt: Date;
  readonly learningEffect: PostRatingLearningEffect;
  readonly reason?: PostRatingReason;
};

export type PostRatingRecord = PostRating & {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly idempotencyKey: string;
  readonly target: PostRatingRecordTarget;
};

export const postRatingLearningEffect = (rating: number): PostRatingLearningEffect => {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error('Post rating must be an integer between 1 and 5');
  }

  if (rating <= 2) {
    return 'negative';
  }

  if (rating === 3) {
    return 'neutral';
  }

  return 'positive';
};

export const normalizePostRatingTarget = (target: PostRatingTarget): PostRatingTarget => {
  const feedItemId = normalizeOptional(target.feedItemId);
  const sourceItemId = normalizeOptional(target.sourceItemId);
  const interestId = target.interestId.trim();

  if (interestId.length === 0) {
    throw new Error('Post rating target interestId must be non-empty');
  }

  if (feedItemId === undefined && sourceItemId === undefined) {
    throw new Error('Post rating target requires feedItemId or sourceItemId');
  }

  return {
    feedItemId,
    sourceItemId,
    interestId,
  };
};

export const normalizePostRatingRecordTarget = (
  target: PostRatingRecordTarget,
): PostRatingRecordTarget => {
  const normalized = normalizePostRatingTarget(target);
  const providerKey = target.providerKey.trim().toLocaleLowerCase('en-US');
  const title = target.title.trim();
  const bodyPreview = normalizeOptional(target.bodyPreview);

  if (providerKey.length === 0) {
    throw new Error('Post rating target providerKey must be non-empty');
  }

  if (title.length === 0 && bodyPreview === undefined) {
    throw new Error('Post rating target requires title or bodyPreview');
  }

  return {
    ...normalized,
    providerKey,
    title,
    bodyPreview,
    canonicalUrl: normalizeOptional(target.canonicalUrl),
  };
};

export const postRatingTargetKey = (target: PostRatingTarget): string => {
  const normalized = normalizePostRatingTarget(target);
  const identity = normalized.feedItemId !== undefined
    ? `feed:${normalized.feedItemId}`
    : `source:${normalized.sourceItemId}`;

  return `${normalized.interestId}|${identity}`;
};

export const postRatingTargetsMatch = (
  lookup: PostRatingTarget,
  candidate: PostRatingTarget,
): boolean => {
  const normalizedLookup = normalizePostRatingTarget(lookup);
  const normalizedCandidate = normalizePostRatingTarget(candidate);

  if (normalizedLookup.interestId !== normalizedCandidate.interestId) {
    return false;
  }

  return (
    (normalizedLookup.feedItemId !== undefined &&
      normalizedCandidate.feedItemId === normalizedLookup.feedItemId) ||
    (normalizedLookup.sourceItemId !== undefined &&
      normalizedCandidate.sourceItemId === normalizedLookup.sourceItemId)
  );
};

export const createPostRating = (props: {
  readonly feedbackId: string;
  readonly userId: string;
  readonly rating: number;
  readonly target: PostRatingTarget;
  readonly ratedAt: Date;
  readonly reason?: PostRatingReason;
}): PostRating => {
  const feedbackId = props.feedbackId.trim();
  const userId = props.userId.trim();

  if (feedbackId.length === 0) {
    throw new Error('Post rating feedbackId must be non-empty');
  }

  if (userId.length === 0) {
    throw new Error('Post rating userId must be non-empty');
  }

  return {
    feedbackId,
    userId,
    rating: props.rating,
    target: normalizePostRatingTarget(props.target),
    ratedAt: props.ratedAt,
    learningEffect: postRatingLearningEffect(props.rating),
    reason: normalizePostRatingReason(props.reason),
  };
};

export const createPostRatingRecord = (props: {
  readonly feedbackId: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly userId: string;
  readonly idempotencyKey: string;
  readonly rating: number;
  readonly target: PostRatingRecordTarget;
  readonly ratedAt: Date;
  readonly reason?: PostRatingReason;
}): PostRatingRecord => {
  const idempotencyKey = props.idempotencyKey.trim();

  if (idempotencyKey.length === 0) {
    throw new Error('Post rating idempotencyKey must be non-empty');
  }

  const rating = createPostRating({
    feedbackId: props.feedbackId,
    userId: props.userId,
    rating: props.rating,
    target: props.target,
    ratedAt: props.ratedAt,
    reason: props.reason,
  });

  return {
    ...rating,
    tenantId: props.tenantId,
    workspaceId: props.workspaceId,
    idempotencyKey,
    target: normalizePostRatingRecordTarget(props.target),
  };
};

export const postRatingRecordFromFeedbackSignal = (
  signal: RelevanceFeedbackSignal,
): PostRatingRecord | null => {
  const snapshot = signal.toSnapshot();
  if (snapshot.action !== 'rate_post' || snapshot.rating === undefined) {
    return null;
  }

  return createPostRatingRecord({
    feedbackId: snapshot.id,
    tenantId: snapshot.tenantId,
    workspaceId: snapshot.workspaceId,
    userId: snapshot.userId,
    idempotencyKey: snapshot.idempotencyKey,
    rating: snapshot.rating,
    reason: snapshot.target.postRatingReason,
    target: {
      feedItemId: snapshot.target.feedItemId,
      sourceItemId: snapshot.target.sourceItemId,
      interestId: snapshot.target.interestId,
      providerKey: snapshot.target.providerKey,
      title: snapshot.target.title,
      bodyPreview: snapshot.target.bodyPreview,
      canonicalUrl: snapshot.target.canonicalUrl,
    },
    ratedAt: snapshot.createdAt,
  });
};

const normalizeOptional = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();

  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
};
