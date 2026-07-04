import type {
  SummaryCitation,
  SummaryConfidence,
  SummaryKeyPoint,
  SummaryQualityFlag,
  SummaryRisk,
} from '../../domain';
import type {
  GeneratedSummaryDraft,
  SummaryModelEstimate,
  SummaryModelInput,
  SummaryModelRoute,
} from '../../ports';
import {
  fallbackCitationMap,
  normalizeCitationIds,
  normalizeCitationMap,
  withEvidenceBackedCitations,
  withKnownCitationIds,
  withKnownRiskCitationIds,
} from './openai-responses-summary-citations';
import {
  assertOpenAiSummaryDraftShape,
  summaryQualityFlagSet,
} from './openai-responses-summary-draft-shape';
import {
  normalizeOptionalStringArray,
  normalizeStringArray,
  optionalString,
  requiredArray,
  requiredNumber,
  requiredRecord,
  requiredString,
} from './openai-responses-summary-json';

export { assertOpenAiSummaryDraftShape } from './openai-responses-summary-draft-shape';

const defaultNoSignalReason =
  'No eligible evidence items selected for this interest.';

const confidenceLevels = new Set<SummaryConfidence['level']>([
  'none',
  'low',
  'medium',
  'high',
]);
const riskReasons = new Set<NonNullable<SummaryRisk['reason']>>([
  'insufficient_evidence',
  'conflicting_evidence',
  'source_limit',
]);

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
  const modelCitationMap = normalizeCitationMap(raw.citationMap);
  const citationMap = withEvidenceBackedCitations(
    modelCitationMap.length === 0
      ? fallbackCitationMap(input.evidence.items)
      : modelCitationMap,
    input.evidence.items,
  );
  const knownCitationIds = new Set(
    citationMap.map((citation) => citation.citationId),
  );
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

const normalizeKeyPoints = (
  value: unknown,
  citationMap: readonly SummaryCitation[],
): readonly SummaryKeyPoint[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const values = requiredArray(value, 'keyPoints');

  return values.map((item, index) => {
    if (typeof item === 'string') {
      return {
        claim: stringOrFallback(item, `Evidence signal ${index + 1}`),
        citationIds: fallbackCitationIdsForKeyPoint(index, citationMap),
      };
    }

    const record = requiredRecord(item, `keyPoints[${index}]`);
    const claim = stringOrFallback(
      record.claim ?? record.point ?? record.title,
      `Evidence signal ${index + 1}`,
    );
    const citationIds = normalizeCitationIds(
      record.citationIds ?? record.citations,
      `keyPoints[${index}].citationIds`,
    );

    return {
      claim,
      citationIds:
        citationIds.length === 0
          ? fallbackCitationIdsForKeyPoint(index, citationMap)
          : citationIds,
    };
  });
};

const fallbackCitationIdsForKeyPoint = (
  index: number,
  citationMap: readonly SummaryCitation[],
): readonly string[] => {
  const indexedCitation = citationMap[index]?.citationId;
  if (indexedCitation !== undefined) {
    return [indexedCitation];
  }

  const firstCitation = citationMap[0]?.citationId;
  return firstCitation === undefined ? [] : [firstCitation];
};

const normalizeRisks = (value: unknown): readonly SummaryRisk[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const values = requiredArray(value, 'risksAndUnknowns');

  return values.map((item, index) => {
    if (typeof item === 'string') {
      return {
        description: stringOrFallback(item, `Unspecified risk ${index + 1}`),
        citationIds: undefined,
        reason: undefined,
      };
    }

    const record = requiredRecord(item, `risksAndUnknowns[${index}]`);
    const reason = optionalString(record.reason);

    if (
      reason !== undefined &&
      !riskReasons.has(reason as NonNullable<SummaryRisk['reason']>)
    ) {
      throw new Error(
        `Invalid summary risk reason at risksAndUnknowns[${index}].reason`,
      );
    }
    const description = stringOrFallback(
      record.description ?? record.risk,
      `Unspecified risk ${index + 1}`,
    );

    return {
      description,
      citationIds:
        (record.citationIds ?? record.citations) === null
          ? undefined
          : normalizeOptionalStringArray(record.citationIds ?? record.citations),
      reason: reason as SummaryRisk['reason'],
    };
  });
};

const normalizeSafeStringArray = (value: unknown): readonly string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(sourceHighlightText)
    .filter((item): item is string => item !== undefined)
    .filter((item, index, items) => items.indexOf(item) === index);
};

const sourceHighlightText = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    return nonEmptyString(value);
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const source = nonEmptyString(record.source);
  const whyItMatters = nonEmptyString(record.whyItMatters);
  if (source !== undefined && whyItMatters !== undefined) {
    return `${source}: ${whyItMatters}`;
  }

  return source ?? whyItMatters;
};

const normalizeQualityFlags = (
  value: unknown,
): readonly SummaryQualityFlag[] => {
  const values =
    value === undefined || value === null
      ? []
      : typeof value === 'string'
        ? [value]
        : Array.isArray(value)
          ? normalizeStringArray(value, 'qualityFlags')
          : qualityFlagKeysFromRecord(value);

  return values.filter((flag): flag is SummaryQualityFlag =>
    summaryQualityFlagSet.has(flag as SummaryQualityFlag),
  );
};

const qualityFlagKeysFromRecord = (value: unknown): readonly string[] => {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return [];
  }

  return Object.entries(value)
    .filter(([, enabled]) => enabled === true)
    .map(([flag]) => flag);
};

const normalizeNoSignalReason = (
  value: unknown,
  normalizedQualityFlags: readonly SummaryQualityFlag[],
): string | undefined => {
  const reason = optionalString(value);

  if (reason !== undefined || !normalizedQualityFlags.includes('no_signal')) {
    return reason;
  }

  return defaultNoSignalReason;
};

const normalizeConfidence = (value: unknown): SummaryConfidence => {
  if (value === undefined || value === null) {
    return {
      level: 'medium',
      score: 0.62,
      rationale:
        'Confidence inferred from selected evidence because provider output omitted confidence metadata.',
    };
  }

  const record = requiredRecord(value, 'confidence');
  const level = requiredString(record.level, 'confidence.level');
  const score = requiredNumber(record.score, 'confidence.score');

  if (!confidenceLevels.has(level as SummaryConfidence['level'])) {
    throw new Error('Invalid summary confidence level');
  }

  return {
    level: level as SummaryConfidence['level'],
    score,
    rationale: requiredString(record.rationale, 'confidence.rationale'),
  };
};

const fallbackHeadline = (
  raw: Record<string, unknown>,
  input: SummaryModelInput,
): string =>
  headlineFromSummary(raw.summary) ??
  input.evidence.items[0]?.title ??
  'Current monitored signals';

const fallbackExecutiveSummary = (
  raw: Record<string, unknown>,
  input: SummaryModelInput,
): string =>
  nonEmptyString(raw.summary) ??
  input.evidence.items[0]?.bodyPreview ??
  input.evidence.items[0]?.title ??
  'Selected evidence was available, but the provider omitted an executive summary.';

const headlineFromSummary = (value: unknown): string | undefined => {
  const summary = nonEmptyString(value);
  if (summary === undefined) {
    return undefined;
  }

  const firstLine = summary
    .split(/(?:\r?\n|\\n)/u)
    .map((line) => line.replace(/^[-*]\s*/u, '').trim())
    .find((line) => line.length > 0);
  if (firstLine === undefined) {
    return undefined;
  }

  return firstLine.length <= 140
    ? firstLine
    : `${firstLine.slice(0, 137).trimEnd()}...`;
};

const stringOrFallback = (value: unknown, fallback: string): string =>
  nonEmptyString(value) ?? fallback;

const nonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};
