import { postRatingLearningEffect } from './post-rating';
import {
  normalizePostRatingReason,
  postRatingRequiresReason,
} from './post-rating-reason';

describe('postRatingLearningEffect', () => {
  it.each([
    [1, 'negative'],
    [2, 'negative'],
    [3, 'neutral'],
    [4, 'positive'],
    [5, 'positive'],
  ] as const)('maps %s stars to %s learning effect', (rating, effect) => {
    expect(postRatingLearningEffect(rating)).toBe(effect);
  });
});

describe('postRatingRequiresReason', () => {
  it.each([
    [1, true],
    [2, true],
    [3, false],
    [4, false],
    [5, false],
  ] as const)('returns %s for %s-star ratings', (rating, expected) => {
    expect(postRatingRequiresReason(rating)).toBe(expected);
  });
});

describe('normalizePostRatingReason', () => {
  it('keeps supported post rating reasons', () => {
    expect(normalizePostRatingReason('weak_source')).toBe('weak_source');
  });

  it('rejects unsupported post rating reasons', () => {
    expect(() => normalizePostRatingReason('bad_reason' as never)).toThrow(
      'unsupported',
    );
  });
});
