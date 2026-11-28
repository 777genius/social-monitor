import {
  readerValueLabels,
  type ReaderValueAnswers,
} from '@social-monitor/relevance/domain/reader-value/reader-value-assessment';
import {
  readerPromotionAnswerChoices,
  type ReaderPromotionAnswers,
} from '../../domain/policies/reader-promotion-answer-snapshot';

// Both directions must typecheck: a new provider field, narrowed union or
// changed probability dictionary must not silently weaken summary admission.
const providerAssignsToConsumer:
  ReaderValueAnswers extends ReaderPromotionAnswers ? true : false = true;
const consumerAssignsToProvider:
  ReaderPromotionAnswers extends ReaderValueAnswers ? true : false = true;

describe('reader-promotion consumer-owned assessment snapshot', () => {
  it('preserves exact provider choice vocabularies for every criterion', () => {
    expect(readerPromotionAnswerChoices).toEqual(readerValueLabels);
    expect(providerAssignsToConsumer).toBe(true);
    expect(consumerAssignsToProvider).toBe(true);
  });
});
