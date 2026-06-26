import { redactSensitiveText } from '@social-monitor/shared-kernel';

import type { RecordSummaryFeedbackMemoryCommand } from '../../ports';

type MemoStackFactKind = 'note' | 'architecture_decision' | 'constraint' | 'user_preference';

export type FeedbackMemoryMapping = {
  readonly factKind: MemoStackFactKind;
  readonly factCategory: string;
  readonly guidance: string;
  readonly action: string;
  readonly tags: readonly string[];
};

export type ProviderQualitySignal = {
  readonly action: string;
  readonly guidance: string;
  readonly tags: readonly string[];
};

export type UserPreferenceSignal = {
  readonly action: string;
  readonly factCategory: string;
  readonly guidance: string;
  readonly tags: readonly string[];
};

export const feedbackMemoryText = (
  command: RecordSummaryFeedbackMemoryCommand,
  mapping: FeedbackMemoryMapping,
  providerQuality: ProviderQualitySignal | undefined,
): string =>
  redactSensitiveText([
    `Summary feedback for topic ${command.topicId}: rating ${command.rating}/5, category ${command.category}.`,
    `Memory guidance: ${mapping.guidance}.`,
    providerQuality === undefined ? '' : `Provider quality lesson: ${providerQuality.guidance}.`,
    command.comment === undefined ? '' : `User note: ${command.comment}`,
    command.citationId === undefined ? '' : `Citation ${command.citationId} was involved.`,
    command.providerKey === undefined ? '' : `Provider ${command.providerKey} was involved.`,
  ].filter((line) => line.length > 0).join(' '));

export const feedbackTags = (
  command: RecordSummaryFeedbackMemoryCommand,
  mapping: FeedbackMemoryMapping,
): readonly string[] => [
  'summary-feedback',
  `rating-${command.rating}`,
  `category-${command.category}`,
  ...mapping.tags,
  ...(command.providerKey === undefined ? [] : [`provider-${command.providerKey}`]),
];

export const providerQualityTags = (
  command: RecordSummaryFeedbackMemoryCommand,
  providerQuality: ProviderQualitySignal,
): readonly string[] => [
  'summary-feedback',
  `rating-${command.rating}`,
  `category-${command.category}`,
  ...providerQuality.tags,
  ...(command.providerKey === undefined ? [] : [`provider-${command.providerKey}`]),
];

export const userPreferenceMemoryText = (
  command: RecordSummaryFeedbackMemoryCommand,
  userPreference: UserPreferenceSignal,
): string =>
  redactSensitiveText([
    `User summary preference for topic ${command.topicId}: rating ${command.rating}/5, category ${command.category}.`,
    `Guidance: ${userPreference.guidance}.`,
    command.comment === undefined ? '' : `User note: ${command.comment}`,
  ].filter((line) => line.length > 0).join(' '));

export const userPreferenceTags = (
  command: RecordSummaryFeedbackMemoryCommand,
  userPreference: UserPreferenceSignal,
): readonly string[] => [
  'summary-feedback',
  'user-preference',
  `rating-${command.rating}`,
  `category-${command.category}`,
  ...userPreference.tags,
  ...(command.providerKey === undefined ? [] : [`provider-${command.providerKey}`]),
];

export const userPreferenceSignal = (
  command: RecordSummaryFeedbackMemoryCommand,
  mapping: FeedbackMemoryMapping,
  providerQuality: ProviderQualitySignal | undefined,
): UserPreferenceSignal | undefined => {
  const providerKey = command.providerKey;
  if (providerKey !== undefined) {
    if (providerQuality?.action === 'prefer_requested_provider_coverage') {
      return {
        action: 'prefer_similar_provider_evidence',
        factCategory: 'relevance_quality',
        guidance: `prefer similar ${providerKey} evidence when it matches the user's requested coverage`,
        tags: ['relevance-quality', 'ranking-prefer-provider'],
      };
    }

    if (providerQuality !== undefined) {
      return {
        action: 'downrank_similar_provider_evidence',
        factCategory: 'relevance_quality',
        guidance: `down-rank similar ${providerKey} evidence unless stronger corroboration exists`,
        tags: ['relevance-quality', 'ranking-downrank-provider'],
      };
    }
  }

  switch (command.category) {
    case 'too_verbose':
    case 'too_terse':
    case 'ux_confusing':
      return {
        action: mapping.action,
        factCategory: mapping.factCategory,
        guidance: mapping.guidance,
        tags: mapping.tags,
      };
    default:
      return undefined;
  }
};

export const providerQualitySignal = (
  command: RecordSummaryFeedbackMemoryCommand,
): ProviderQualitySignal | undefined => {
  if (command.providerKey === undefined) {
    return undefined;
  }

  const comment = command.comment?.toLocaleLowerCase('en-US') ?? '';
  if (
    comment.includes('down-rank') ||
    comment.includes('downrank') ||
    comment.includes('low-signal') ||
    comment.includes('noisy')
  ) {
    return {
      action: 'downrank_low_signal_provider',
      guidance: `down-rank low-signal ${command.providerKey} evidence for this topic unless stronger corroboration exists`,
      tags: ['provider-quality', 'provider-downrank'],
    };
  }

  switch (command.category) {
    case 'low_relevance':
      return {
        action: 'downrank_low_signal_provider',
        guidance: `down-rank low-signal ${command.providerKey} evidence for this topic unless stronger corroboration exists`,
        tags: ['provider-quality', 'provider-downrank'],
      };
    case 'bad_citation':
      return {
        action: 'review_provider_citation_support',
        guidance: `treat ${command.providerKey} evidence as needing stricter citation support for similar claims`,
        tags: ['provider-quality', 'provider-citation-review'],
      };
    case 'wrong_fact':
      return {
        action: 'require_provider_corroboration',
        guidance: `require stronger corroboration before using similar ${command.providerKey} evidence as factual support`,
        tags: ['provider-quality', 'provider-corroboration-required'],
      };
    case 'missing_source':
    case 'source_request':
      return {
        action: 'prefer_requested_provider_coverage',
        guidance: `prefer relevant ${command.providerKey} coverage when the user asks for this source family`,
        tags: ['provider-quality', 'provider-coverage-requested'],
      };
    default:
      return undefined;
  }
};

export const feedbackMemoryMapping = (category: string): FeedbackMemoryMapping => {
  switch (category) {
    case 'too_verbose':
      return {
        factKind: 'user_preference',
        factCategory: 'summary_style_preference',
        guidance: 'prefer shorter summaries for this topic/user unless evidence risk is high',
        action: 'prefer_shorter_summary',
        tags: ['preference-candidate', 'style-shorter'],
      };
    case 'too_terse':
      return {
        factKind: 'user_preference',
        factCategory: 'summary_style_preference',
        guidance: 'include more detail and rationale for this topic/user',
        action: 'prefer_more_detail',
        tags: ['preference-candidate', 'style-more-detail'],
      };
    case 'bad_citation':
      return {
        factKind: 'user_preference',
        factCategory: 'citation_quality',
        guidance: 'tighten citation selection and avoid attaching evidence to unsupported claims',
        action: 'improve_citation_precision',
        tags: ['citation-quality', 'validator-signal'],
      };
    case 'missing_source':
    case 'source_request':
      return {
        factKind: 'user_preference',
        factCategory: 'source_coverage',
        guidance: 'prefer summaries that include the requested source family when relevant evidence exists',
        action: 'prefer_requested_source_coverage',
        tags: ['source-preference', 'coverage-signal'],
      };
    case 'low_relevance':
      return {
        factKind: 'user_preference',
        factCategory: 'relevance_quality',
        guidance: 'down-rank similar low-signal evidence and prioritize stronger relevance matches',
        action: 'improve_relevance_ranking',
        tags: ['relevance-quality', 'ranking-signal'],
      };
    case 'wrong_fact':
      return {
        factKind: 'user_preference',
        factCategory: 'factual_accuracy',
        guidance: 'treat the referenced claim as unsafe until supported by stronger evidence',
        action: 'block_or_review_wrong_fact',
        tags: ['factual-accuracy', 'validator-signal'],
      };
    case 'ux_confusing':
      return {
        factKind: 'user_preference',
        factCategory: 'summary_ux',
        guidance: 'make summary wording and grouping clearer for this topic/user',
        action: 'improve_summary_clarity',
        tags: ['ux-quality', 'clarity-signal'],
      };
    default:
      return {
        factKind: 'user_preference',
        factCategory: 'summary_feedback',
        guidance: 'consider this as general summary feedback for future generation',
        action: 'record_general_feedback',
        tags: ['general-feedback'],
      };
  }
};
