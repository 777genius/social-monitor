export const postRatingReasons = [
  'duplicate',
  'off_topic',
  'weak_source',
  'too_old',
  'low_quality',
] as const;

export type PostRatingReason = (typeof postRatingReasons)[number];

const supportedPostRatingReasons = new Set<PostRatingReason>(postRatingReasons);

export const postRatingRequiresReason = (rating: number): boolean =>
  Number.isInteger(rating) && rating >= 1 && rating <= 2;

export const normalizePostRatingReason = (
  reason: PostRatingReason | undefined,
): PostRatingReason | undefined => {
  if (reason === undefined) {
    return undefined;
  }

  if (!supportedPostRatingReasons.has(reason)) {
    throw new Error('Post rating reason is unsupported');
  }

  return reason;
};
