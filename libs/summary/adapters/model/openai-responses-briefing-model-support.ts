import type {
  BriefingCitation,
  BriefingConfidence,
  BriefingQualityFlag,
  BriefingRepeatedSignal,
  BriefingRisk,
  BriefingTopStory,
  BriefingTopicHighlight,
  GeneratedBriefingDraft,
} from '../../domain';
import { buildBriefingReaderBrief } from '../../domain';
import type {
  BriefingModelEstimate,
  BriefingModelFailure,
  BriefingModelInput,
  BriefingModelRoute,
} from '../../ports';
import {
  openAiBriefingReaderJsonSchemaDefs,
} from './openai-responses-briefing-reader-support';

const qualityFlags = new Set<BriefingQualityFlag>([
  'no_signal',
  'low_confidence',
  'conflicting_evidence',
  'limited_sources',
  'partial_evidence',
  'context_unavailable',
  'provider_failed',
]);
const confidenceLevels = new Set<BriefingConfidence['level']>(['none', 'low', 'medium', 'high']);
const citationFields = new Set<BriefingCitation['field']>(['title', 'bodyPreview', 'canonicalUrl']);
const riskReasons = new Set<NonNullable<BriefingRisk['reason']>>([
  'insufficient_evidence',
  'conflicting_evidence',
  'source_limit',
  'provider_outage',
]);

export const normalizeOpenAiBriefingDraft = (
  raw: Record<string, unknown>,
  input: BriefingModelInput,
  route: BriefingModelRoute,
  usage: GeneratedBriefingDraft['usage'],
  evalDatasetVersion: string,
): GeneratedBriefingDraft => {
  const citationMap = withEvidenceCanonicalUrls(
    requiredArray<Record<string, unknown>>(raw.citationMap, 'briefing citation map')
      .map(normalizeCitation),
    input.evidence.selectedEvidence,
  );
  const headline = requiredString(raw.headline, 'briefing headline');
  const executiveSummary = requiredString(raw.executiveSummary, 'briefing executive summary');
  const topStories = requiredArray<Record<string, unknown>>(raw.topStories, 'briefing top stories').map(normalizeTopStory);
  const topicHighlights = input.policy.includeTopicHighlights
    ? requiredArray<Record<string, unknown>>(raw.topicHighlights, 'briefing topic highlights').map(normalizeTopicHighlight)
    : [];
  const repeatedSignals = input.policy.includeRepeatedSignals
    ? requiredArray<Record<string, unknown>>(raw.repeatedSignals, 'briefing repeated signals').map(normalizeRepeatedSignal)
    : [];
  const risksAndUnknowns = input.policy.includeRisks
    ? requiredArray<Record<string, unknown>>(raw.risksAndUnknowns, 'briefing risks').map(normalizeRisk)
    : [];
  const qualityFlags = normalizeQualityFlags(raw.qualityFlags);
  const noSignalReason = optionalString(raw.noSignalReason);
  const readerBrief = buildBriefingReaderBrief({
    headline,
    executiveSummary,
    topStories,
    topicHighlights,
    repeatedSignals,
    risksAndUnknowns,
    citationMap,
    storyClusters: input.evidence.clusters,
    selectedEvidence: input.evidence.selectedEvidence,
    qualityFlags,
    noSignalReason,
  });
  const draft: GeneratedBriefingDraft = {
    headline,
    executiveSummary,
    readerBrief,
    topStories,
    topicHighlights,
    repeatedSignals,
    risksAndUnknowns,
    citationMap,
    qualityFlags,
    confidence: normalizeConfidence(requiredRecord(raw.confidence, 'briefing confidence')),
    lineage: buildLineage(input, route, evalDatasetVersion),
    usage,
    noSignalReason,
  };
  assertOpenAiBriefingDraftShape(draft);

  return draft;
};

export const buildOpenAiBriefingLineage = (
  input: BriefingModelInput,
  route: BriefingModelRoute,
  evalDatasetVersion: string,
): GeneratedBriefingDraft['lineage'] => ({
  promptVersion: route.promptVersion,
  schemaVersion: route.schemaVersion,
  modelVersion: route.model,
  providerVersion: route.provider,
  rulesVersion: input.policy.rulesVersion,
  evalDatasetVersion,
});

export const assertOpenAiBriefingDraftShape = (draft: GeneratedBriefingDraft): void => {
  if (draft.headline.trim().length === 0 || draft.executiveSummary.trim().length === 0) {
    throw new Error('Briefing draft must include headline and executive summary');
  }
  if (draft.confidence.score < 0 || draft.confidence.score > 1) {
    throw new Error('Briefing confidence score must be between 0 and 1');
  }
  if (draft.topStories.length === 0 && !draft.qualityFlags.includes('no_signal')) {
    throw new Error('Briefing draft without top stories must be marked no_signal');
  }
};

export const openAiBriefingJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'headline',
    'executiveSummary',
    'readerBrief',
    'topStories',
    'topicHighlights',
    'repeatedSignals',
    'risksAndUnknowns',
    'citationMap',
    'qualityFlags',
    'confidence',
    'noSignalReason',
  ],
  properties: {
    headline: { type: 'string' },
    executiveSummary: { type: 'string' },
    readerBrief: { $ref: '#/$defs/readerBrief' },
    topStories: { type: 'array', items: { $ref: '#/$defs/topStory' } },
    topicHighlights: { type: 'array', items: { $ref: '#/$defs/topicHighlight' } },
    repeatedSignals: { type: 'array', items: { $ref: '#/$defs/repeatedSignal' } },
    risksAndUnknowns: { type: 'array', items: { $ref: '#/$defs/risk' } },
    citationMap: { type: 'array', items: { $ref: '#/$defs/citation' } },
    qualityFlags: { type: 'array', items: { enum: [...qualityFlags] } },
    confidence: {
      type: 'object',
      additionalProperties: false,
      required: ['level', 'score', 'rationale'],
      properties: {
        level: { enum: [...confidenceLevels] },
        score: { type: 'number', minimum: 0, maximum: 1 },
        rationale: { type: 'string' },
      },
    },
    noSignalReason: { type: ['string', 'null'] },
  },
  $defs: {
    ...openAiBriefingReaderJsonSchemaDefs,
    topStory: objectSchema(['storyClusterId', 'title', 'summary', 'topicIds', 'providerKeys', 'citationIds'], {
      storyClusterId: { type: 'string' },
      title: { type: 'string' },
      summary: { type: 'string' },
      topicIds: stringArraySchema(),
      providerKeys: stringArraySchema(),
      citationIds: stringArraySchema(),
    }),
    topicHighlight: objectSchema(['topicId', 'title', 'summary', 'citationIds'], {
      topicId: { type: 'string' },
      title: { type: 'string' },
      summary: { type: 'string' },
      citationIds: stringArraySchema(),
    }),
    repeatedSignal: objectSchema(['storyClusterId', 'title', 'topicIds', 'citationIds'], {
      storyClusterId: { type: 'string' },
      title: { type: 'string' },
      topicIds: stringArraySchema(),
      citationIds: stringArraySchema(),
    }),
    risk: objectSchema(['description', 'citationIds', 'reason'], {
      description: { type: 'string' },
      citationIds: { type: ['array', 'null'], items: { type: 'string' } },
      reason: { enum: [...riskReasons, null] },
    }),
    citation: objectSchema(['citationId', 'feedItemId', 'sourceItemId', 'providerKey', 'field'], {
      citationId: { type: 'string' },
      feedItemId: { type: 'string' },
      sourceItemId: { type: 'string' },
      providerKey: { type: 'string' },
      field: { enum: [...citationFields] },
    }),
  },
} as const;

export const extractOpenAiOutputText = (response: Record<string, unknown>): string | undefined => {
  if (typeof response.output_text === 'string' && response.output_text.trim().length > 0) {
    return response.output_text;
  }

  for (const output of requiredArray<Record<string, unknown>>(response.output ?? [], 'OpenAI output')) {
    for (const content of requiredArray<Record<string, unknown>>(output.content ?? [], 'OpenAI content')) {
      if (typeof content.text === 'string' && content.text.trim().length > 0) {
        return content.text;
      }
    }
  }

  return undefined;
};

export const resolveOpenAiBriefingUsage = (
  response: Record<string, unknown>,
  fallback: BriefingModelEstimate,
): GeneratedBriefingDraft['usage'] => {
  const usage = asRecord(response.usage);
  const inputTokens = numberOrFallback(usage?.input_tokens, fallback.inputTokens);
  const outputTokens = numberOrFallback(usage?.output_tokens, fallback.outputTokens);

  return {
    inputTokens,
    outputTokens,
    estimatedCostUsd: fallback.estimatedCostUsd,
  };
};

export const parseOpenAiBriefingJsonObject = (value: string): Record<string, unknown> => {
  try {
    return requiredRecord(JSON.parse(value), 'OpenAI briefing output');
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown parse failure';
    throw new Error(`OpenAI briefing output must be JSON: ${detail}`);
  }
};

export const classifyOpenAiBriefingHttpFailure = (status: number, body: unknown): BriefingModelFailure => {
  const message = extractOpenAiErrorMessage(body) ?? `OpenAI briefing request failed with HTTP ${status}`;
  if (status === 429) {
    return { kind: 'provider_rate_limited', retryable: true, message };
  }
  if (status === 400 || status === 413) {
    return { kind: 'context_too_large', retryable: false, message };
  }
  if (status === 401 || status === 403) {
    return { kind: 'provider_unavailable', retryable: false, message };
  }
  if (status >= 500) {
    return { kind: 'provider_unavailable', retryable: true, message };
  }

  return { kind: 'provider_unavailable', retryable: false, message };
};

export const readOpenAiResponseBody = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (text.trim().length === 0) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

export const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

const buildLineage = buildOpenAiBriefingLineage;

const normalizeTopStory = (value: Record<string, unknown>): BriefingTopStory => ({
  storyClusterId: requiredString(value.storyClusterId, 'top story cluster id'),
  title: requiredString(value.title, 'top story title'),
  summary: requiredString(value.summary, 'top story summary'),
  topicIds: requiredStringArray(value.topicIds, 'top story topics'),
  providerKeys: requiredStringArray(value.providerKeys, 'top story providers'),
  citationIds: requiredStringArray(value.citationIds, 'top story citations'),
});

const normalizeTopicHighlight = (value: Record<string, unknown>): BriefingTopicHighlight => ({
  topicId: requiredString(value.topicId, 'topic highlight topic id'),
  title: requiredString(value.title, 'topic highlight title'),
  summary: requiredString(value.summary, 'topic highlight summary'),
  citationIds: requiredStringArray(value.citationIds, 'topic highlight citations'),
});

const normalizeRepeatedSignal = (value: Record<string, unknown>): BriefingRepeatedSignal => ({
  storyClusterId: requiredString(value.storyClusterId, 'repeated signal cluster id'),
  title: requiredString(value.title, 'repeated signal title'),
  topicIds: requiredStringArray(value.topicIds, 'repeated signal topics'),
  citationIds: requiredStringArray(value.citationIds, 'repeated signal citations'),
});

const normalizeRisk = (value: Record<string, unknown>): BriefingRisk => ({
  description: requiredString(value.description, 'risk description'),
  citationIds: requiredOptionalStringArray(value.citationIds, 'risk citations'),
  reason: normalizeSetValue(value.reason, riskReasons, 'risk reason'),
});

const normalizeCitation = (value: Record<string, unknown>): BriefingCitation => ({
  citationId: requiredString(value.citationId, 'citation id'),
  feedItemId: requiredString(value.feedItemId, 'citation feed item id'),
  sourceItemId: requiredString(value.sourceItemId, 'citation source item id'),
  providerKey: requiredString(value.providerKey, 'citation provider key'),
  field: normalizeSetValue(value.field, citationFields, 'citation field') ?? 'title',
});

const withEvidenceCanonicalUrls = (
  citations: readonly BriefingCitation[],
  evidenceItems: BriefingModelInput['evidence']['selectedEvidence'],
): readonly BriefingCitation[] => {
  const canonicalUrlByFeedItemId = new Map(
    evidenceItems.map((item) => [item.feedItemId, item.canonicalUrl] as const),
  );

  return citations.map((citation) => ({
    ...citation,
    canonicalUrl: canonicalUrlByFeedItemId.get(citation.feedItemId),
  }));
};

const normalizeConfidence = (value: Record<string, unknown>): BriefingConfidence => ({
  level: normalizeSetValue(value.level, confidenceLevels, 'confidence level') ?? 'low',
  score: requiredNumber(value.score, 'confidence score'),
  rationale: requiredString(value.rationale, 'confidence rationale'),
});

const normalizeQualityFlags = (value: unknown): readonly BriefingQualityFlag[] =>
  requiredOptionalStringArray(value, 'quality flags')
    .map((flag) => normalizeSetValue(flag, qualityFlags, 'quality flag'))
    .filter((flag): flag is BriefingQualityFlag => flag !== undefined);

function objectSchema(required: readonly string[], properties: Record<string, unknown>) {
  return {
  type: 'object',
  additionalProperties: false,
  required,
  properties,
  };
}

function stringArraySchema() {
  return { type: 'array', items: { type: 'string' } };
}

const requiredString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }

  return value.trim();
};

const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const requiredNumber = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }

  return value;
};

const requiredArray = <T>(value: unknown, label: string): readonly T[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }

  return value as T[];
};

const requiredStringArray = (value: unknown, label: string): readonly string[] =>
  requiredArray<unknown>(value, label).map((item) => requiredString(item, label));

const requiredOptionalStringArray = (value: unknown, label: string): readonly string[] =>
  value === undefined || value === null ? [] : requiredStringArray(value, label);

const requiredRecord = (value: unknown, label: string): Record<string, unknown> => {
  const record = asRecord(value);
  if (record === null) {
    throw new Error(`${label} must be an object`);
  }

  return record;
};

const normalizeSetValue = <T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  label: string,
): T | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string' || !allowed.has(value as T)) {
    throw new Error(`Unsupported ${label}`);
  }

  return value as T;
};

const numberOrFallback = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;

const extractOpenAiErrorMessage = (body: unknown): string | undefined => {
  const record = asRecord(body);
  const error = asRecord(record?.error);
  return typeof error?.message === 'string' ? error.message : undefined;
};
