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
  normalizeOptionalStringArray,
  normalizeStringArray,
  optionalString,
  requiredArray,
  requiredNumber,
  requiredRecord,
  requiredString,
} from './openai-responses-summary-json';

const defaultNoSignalReason =
  'No eligible evidence items selected for this interest.';

const qualityFlags = new Set<SummaryQualityFlag>([
  'no_signal',
  'low_confidence',
  'conflicting_evidence',
  'limited_sources',
]);
const confidenceLevels = new Set<SummaryConfidence['level']>([
  'none',
  'low',
  'medium',
  'high',
]);
const citationFields = new Set<SummaryCitation['field']>([
  'title',
  'bodyPreview',
  'canonicalUrl',
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
    if (!qualityFlags.has(flag)) {
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

const normalizeCitationMap = (value: unknown): readonly SummaryCitation[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const values = requiredArray(value, 'citationMap');

  return values.map((item, index) => {
    const record = requiredRecord(item, `citationMap[${index}]`);
    const field = requiredString(record.field, `citationMap[${index}].field`);

    if (!citationFields.has(field as SummaryCitation['field'])) {
      throw new Error(`Invalid citation field at citationMap[${index}].field`);
    }

    return {
      citationId: requiredString(
        record.citationId,
        `citationMap[${index}].citationId`,
      ),
      feedItemId: requiredString(
        record.feedItemId,
        `citationMap[${index}].feedItemId`,
      ),
      sourceItemId: requiredString(
        record.sourceItemId,
        `citationMap[${index}].sourceItemId`,
      ),
      providerKey: requiredString(
        record.providerKey,
        `citationMap[${index}].providerKey`,
      ),
      field: field as SummaryCitation['field'],
    };
  });
};

const fallbackCitationMap = (
  evidenceItems: SummaryModelInput['evidence']['items'],
): readonly SummaryCitation[] =>
  evidenceItems.map((item, index) => ({
    citationId: `c${index + 1}`,
    feedItemId: item.feedItemId,
    sourceItemId: item.sourceItemId,
    providerKey: item.providerKey,
    field: chooseEvidenceCitationField(item, 'bodyPreview'),
  }));

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

const withEvidenceBackedCitations = (
  citations: readonly SummaryCitation[],
  evidenceItems: SummaryModelInput['evidence']['items'],
): readonly SummaryCitation[] => {
  const evidenceByCitationId = new Map<
    string,
    SummaryModelInput['evidence']['items'][number]
  >(evidenceItems.map((item, index) => [`c${index + 1}`, item] as const));

  return citations.flatMap((citation) => {
    const evidence = evidenceByCitationId.get(citation.citationId);

    if (evidence === undefined) {
      return [];
    }

    return [
      {
        ...citation,
        feedItemId: evidence.feedItemId,
        sourceItemId: evidence.sourceItemId,
        providerKey: evidence.providerKey,
        canonicalUrl: evidence.canonicalUrl,
        field: chooseEvidenceCitationField(evidence, citation.field),
      },
    ];
  });
};

const chooseEvidenceCitationField = (
  evidence: SummaryModelInput['evidence']['items'][number],
  preferred: SummaryCitation['field'],
): SummaryCitation['field'] => {
  if (preferred === 'title') {
    return 'title';
  }

  if (preferred === 'bodyPreview' && (evidence.bodyPreview ?? '').trim().length > 0) {
    return 'bodyPreview';
  }

  if (preferred === 'canonicalUrl' && (evidence.canonicalUrl ?? '').trim().length > 0) {
    return 'canonicalUrl';
  }

  return 'title';
};

const withKnownCitationIds = (
  keyPoints: readonly SummaryKeyPoint[],
  knownCitationIds: ReadonlySet<string>,
): readonly SummaryKeyPoint[] =>
  keyPoints
    .map((keyPoint) => ({
      ...keyPoint,
      citationIds: knownStringSubset(keyPoint.citationIds, knownCitationIds),
    }))
    .filter((keyPoint) => keyPoint.citationIds.length > 0);

const withKnownRiskCitationIds = (
  risks: readonly SummaryRisk[],
  knownCitationIds: ReadonlySet<string>,
): readonly SummaryRisk[] =>
  risks.map((risk) => {
    if (risk.citationIds === undefined) {
      return risk;
    }

    const citationIds = knownStringSubset(risk.citationIds, knownCitationIds);

    return {
      ...risk,
      citationIds: citationIds.length === 0 ? undefined : citationIds,
    };
  });

const knownStringSubset = (
  values: readonly string[],
  knownValues: ReadonlySet<string>,
): readonly string[] => {
  const result: string[] = [];
  for (const value of values) {
    if (!knownValues.has(value) || result.includes(value)) {
      continue;
    }

    result.push(value);
  }

  return result;
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
    qualityFlags.has(flag as SummaryQualityFlag),
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

const normalizeCitationIds = (
  value: unknown,
  label: string,
): readonly string[] =>
  value === undefined || value === null
    ? []
    : normalizeStringArray(value, label);

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
