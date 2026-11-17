import type {
  GeneratedSummaryDraft,
  SummaryModelEstimate,
  SummaryModelInput,
  SummaryModelRoute,
} from '../../ports';
import { buildOpenAiSummaryTrustedCitationContext } from './openai-responses-summary-trusted-citation-context';
import {
  withKnownCitationIds,
  withKnownRiskCitationIds,
} from './openai-responses-summary-citation-references';
import {
  assertOpenAiSummaryDraftShape,
} from './openai-responses-summary-draft-shape';

import { normalizeKeyPoints } from './openai-responses-summary-key-points';
import { normalizeRisks } from './openai-responses-summary-risks';
import { normalizeConfidence } from './openai-responses-summary-confidence';
import { normalizeQualityFlags, normalizeNoSignalReason } from './openai-responses-summary-quality';
import { normalizeSafeStringArray, fallbackHeadline, fallbackExecutiveSummary, stringOrFallback } from './openai-responses-summary-text';

export { assertOpenAiSummaryDraftShape } from './openai-responses-summary-draft-shape';

export const buildOpenAiSummaryLineage = (
  input: SummaryModelInput,
  selectedRoute: SummaryModelRoute,
  evalDatasetVersion: string,
) =>
  ({
    promptVersion: selectedRoute.promptVersion,
    schemaVersion: selectedRoute.schemaVersion,
    modelVersion: selectedRoute.model,
    providerVersion: selectedRoute.provider,
    rulesVersion: input.policy.rulesVersion,
    evalDatasetVersion,
  }) as const;

export const normalizeOpenAiSummaryDraft = (
  raw: Record<string, unknown>,
  input: SummaryModelInput,
  selectedRoute: SummaryModelRoute,
  usage: SummaryModelEstimate,
  evalDatasetVersion: string,
): GeneratedSummaryDraft => {
  const normalizedQualityFlags = normalizeQualityFlags(raw.qualityFlags);
  const { citationMap, knownCitationIds } =
    buildOpenAiSummaryTrustedCitationContext(raw, input);
  const draft = {
    headline: stringOrFallback(raw.headline, fallbackHeadline(raw, input)),
    executiveSummary: stringOrFallback(
      raw.executiveSummary,
      fallbackExecutiveSummary(raw, input),
    ),
    keyPoints: withKnownCitationIds(
      normalizeKeyPoints(raw.keyPoints, citationMap),
      knownCitationIds,
    ),
    risksAndUnknowns: withKnownRiskCitationIds(
      normalizeRisks(raw.risksAndUnknowns ?? raw.risks),
      knownCitationIds,
    ),
    sourceHighlights: normalizeSafeStringArray(raw.sourceHighlights),
    citationMap,
    qualityFlags: normalizedQualityFlags,
    confidence: normalizeConfidence(raw.confidence),
    lineage: buildOpenAiSummaryLineage(
      input,
      selectedRoute,
      evalDatasetVersion,
    ),
    usage,
    noSignalReason: normalizeNoSignalReason(
      raw.noSignalReason,
      normalizedQualityFlags,
    ),
  };

  assertOpenAiSummaryDraftShape(draft);

  return draft;
};

