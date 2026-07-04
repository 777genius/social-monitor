import type { SummaryQualityFlag } from '../../domain';
import type { GeneratedSummaryDraft } from '../../ports';

export const summaryQualityFlagSet = new Set<SummaryQualityFlag>([
  'no_signal',
  'low_confidence',
  'conflicting_evidence',
  'limited_sources',
]);

export const assertOpenAiSummaryDraftShape = (
  draft: GeneratedSummaryDraft,
): void => {
  if (draft.headline.trim().length === 0) {
    throw new Error('Summary headline must be non-empty');
  }

  if (draft.executiveSummary.trim().length === 0) {
    throw new Error('Summary executive summary must be non-empty');
  }

  const citationIds = new Set<string>();

  for (const citation of draft.citationMap) {
    if (citation.citationId.trim().length === 0) {
      throw new Error('Summary citation id must be non-empty');
    }

    if (citationIds.has(citation.citationId)) {
      throw new Error(`Duplicate summary citation id ${citation.citationId}`);
    }

    citationIds.add(citation.citationId);
  }

  for (const keyPoint of draft.keyPoints) {
    if (
      keyPoint.claim.trim().length === 0 ||
      keyPoint.citationIds.length === 0
    ) {
      throw new Error('Summary key point must include a claim and citations');
    }

    for (const citationId of keyPoint.citationIds) {
      if (!citationIds.has(citationId)) {
        throw new Error(
          `Summary key point cites unknown citation ${citationId}`,
        );
      }
    }
  }

  for (const risk of draft.risksAndUnknowns) {
    if (risk.description.trim().length === 0) {
      throw new Error('Summary risk description must be non-empty');
    }

    for (const citationId of risk.citationIds ?? []) {
      if (!citationIds.has(citationId)) {
        throw new Error(`Summary risk cites unknown citation ${citationId}`);
      }
    }
  }

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

  if (
    draft.usage.inputTokens < 0 ||
    draft.usage.outputTokens < 0 ||
    draft.usage.estimatedCostUsd < 0
  ) {
    throw new Error('Summary usage values must be non-negative');
  }
};
