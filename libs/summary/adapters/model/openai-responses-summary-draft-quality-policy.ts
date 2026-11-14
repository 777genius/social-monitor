import type { SummaryQualityFlag } from '../../domain';
import type { GeneratedSummaryDraft } from '../../ports';

export const summaryQualityFlagSet = new Set<SummaryQualityFlag>([
  'no_signal',
  'low_confidence',
  'conflicting_evidence',
  'limited_sources',
]);

// Validate summary reliability claims independently from citation trust and usage metering.
export const assertOpenAiSummaryDraftQuality = (
  draft: Pick<GeneratedSummaryDraft, 'qualityFlags' | 'keyPoints' | 'noSignalReason' | 'confidence'>,
): void => {
  for (const flag of draft.qualityFlags) {
    if (!summaryQualityFlagSet.has(flag)) {
      throw new Error(`Invalid summary quality flag ${flag}`);
    }
  }

  if (
    draft.keyPoints.length === 0 &&
    !draft.qualityFlags.includes('no_signal')
  ) {
    throw new Error('No-signal summary must include no_signal quality flag');
  }

  if (
    draft.qualityFlags.includes('no_signal') &&
    (draft.noSignalReason ?? '').trim().length === 0
  ) {
    throw new Error('No-signal summary must include a reason');
  }

  if (draft.confidence.score < 0 || draft.confidence.score > 1) {
    throw new Error('Summary confidence score must be between 0 and 1');
  }
};
