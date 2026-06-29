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
  const citationMap = withEvidenceBackedCitations(
    normalizeCitationMap(raw.citationMap),
    input.evidence.items,
  );
  const knownCitationIds = new Set(
    citationMap.map((citation) => citation.citationId),
  );
  const draft = {
    headline: requiredString(raw.headline, 'headline'),
    executiveSummary: requiredString(raw.executiveSummary, 'executiveSummary'),
    keyPoints: withKnownCitationIds(
      normalizeKeyPoints(raw.keyPoints),
      knownCitationIds,
    ),
    risksAndUnknowns: withKnownRiskCitationIds(
      normalizeRisks(raw.risksAndUnknowns),
      knownCitationIds,
    ),
    sourceHighlights: normalizeStringArray(
      raw.sourceHighlights,
      'sourceHighlights',
    ),
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

const normalizeKeyPoints = (value: unknown): readonly SummaryKeyPoint[] => {
  const values = requiredArray(value, 'keyPoints');

  return values.map((item, index) => {
    const record = requiredRecord(item, `keyPoints[${index}]`);

    return {
      claim: requiredString(record.claim, `keyPoints[${index}].claim`),
      citationIds: normalizeStringArray(
        record.citationIds,
        `keyPoints[${index}].citationIds`,
      ),
    };
  });
};

const normalizeRisks = (value: unknown): readonly SummaryRisk[] => {
  const values = requiredArray(value, 'risksAndUnknowns');

  return values.map((item, index) => {
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

    return {
      description: requiredString(
        record.description,
        `risksAndUnknowns[${index}].description`,
      ),
      citationIds:
        record.citationIds === null
          ? undefined
          : normalizeOptionalStringArray(record.citationIds),
      reason: reason as SummaryRisk['reason'],
    };
  });
};

const normalizeCitationMap = (value: unknown): readonly SummaryCitation[] => {
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
      },
    ];
  });
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
  const values = normalizeStringArray(value, 'qualityFlags');

  for (const flag of values) {
    if (!qualityFlags.has(flag as SummaryQualityFlag)) {
      throw new Error(`Invalid summary quality flag ${flag}`);
    }
  }

  return values as readonly SummaryQualityFlag[];
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
