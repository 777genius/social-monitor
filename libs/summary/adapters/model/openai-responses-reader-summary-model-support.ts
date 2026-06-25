import type {
  ReaderSummaryCitation,
  ReaderSummaryConfidence,
  ReaderSummaryQualityFlag,
  ReaderSummaryRepeatedSignal,
  ReaderSummaryRisk,
  ReaderSummaryTopStory,
  ReaderSummaryTopicHighlight,
  GeneratedReaderSummaryDraft,
} from "../../domain";
import { buildReaderSummary } from "../../domain";
import type {
  ReaderSummaryModelEstimate,
  ReaderSummaryModelFailure,
  ReaderSummaryModelInput,
  ReaderSummaryModelRoute,
} from "../../ports";
import {
  openAiReaderSummaryCitationFields,
  openAiReaderSummaryConfidenceLevels,
  openAiReaderSummaryQualityFlags,
  openAiReaderSummaryRiskReasons,
} from "./openai-responses-reader-summary-contract";
export { openAiReaderSummaryJsonSchema } from "./openai-responses-reader-summary-schema";

const qualityFlags = new Set<ReaderSummaryQualityFlag>(
  openAiReaderSummaryQualityFlags,
);
const confidenceLevels = new Set<ReaderSummaryConfidence["level"]>(
  openAiReaderSummaryConfidenceLevels,
);
const citationFields = new Set<ReaderSummaryCitation["field"]>(
  openAiReaderSummaryCitationFields,
);
const riskReasons = new Set<NonNullable<ReaderSummaryRisk["reason"]>>(
  openAiReaderSummaryRiskReasons,
);

export const normalizeOpenAiReaderSummaryDraft = (
  raw: Record<string, unknown>,
  input: ReaderSummaryModelInput,
  route: ReaderSummaryModelRoute,
  usage: GeneratedReaderSummaryDraft["usage"],
  evalDatasetVersion: string,
): GeneratedReaderSummaryDraft => {
  const citationMap = withEvidenceCanonicalUrls(
    requiredArray<Record<string, unknown>>(
      raw.citationMap,
      "reader summary citation map",
    ).map(normalizeCitation),
    input.evidence.selectedEvidence,
  );
  const headline = requiredString(raw.headline, "reader summary headline");
  const executiveSummary = requiredString(
    raw.executiveSummary,
    "reader summary executive summary",
  );
  const topStories = requiredArray<Record<string, unknown>>(
    raw.topStories,
    "reader summary top reads",
  ).map(normalizeTopStory);
  const topicHighlights = input.policy.includeTopicHighlights
    ? requiredArray<Record<string, unknown>>(
        raw.topicHighlights,
        "reader summary topic highlights",
      ).map(normalizeTopicHighlight)
    : [];
  const repeatedSignals = input.policy.includeRepeatedSignals
    ? requiredArray<Record<string, unknown>>(
        raw.repeatedSignals,
        "reader summary repeated signals",
      ).map(normalizeRepeatedSignal)
    : [];
  const risksAndUnknowns = input.policy.includeRisks
    ? requiredArray<Record<string, unknown>>(
        raw.risksAndUnknowns,
        "reader summary risks",
      ).map(normalizeRisk)
    : [];
  const qualityFlags = normalizeQualityFlags(raw.qualityFlags);
  const noSignalReason = optionalString(raw.noSignalReason);
  const content = buildReaderSummary({
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
  const draft: GeneratedReaderSummaryDraft = {
    headline,
    executiveSummary,
    content,
    topStories,
    topicHighlights,
    repeatedSignals,
    risksAndUnknowns,
    citationMap,
    qualityFlags,
    confidence: normalizeConfidence(
      requiredRecord(raw.confidence, "reader summary confidence"),
    ),
    lineage: buildLineage(input, route, evalDatasetVersion),
    usage,
    noSignalReason,
  };
  assertOpenAiReaderSummaryDraftShape(draft);

  return draft;
};

export const buildOpenAiReaderSummaryLineage = (
  input: ReaderSummaryModelInput,
  route: ReaderSummaryModelRoute,
  evalDatasetVersion: string,
): GeneratedReaderSummaryDraft["lineage"] => ({
  promptVersion: route.promptVersion,
  schemaVersion: route.schemaVersion,
  modelVersion: route.model,
  providerVersion: route.provider,
  rulesVersion: input.policy.rulesVersion,
  evalDatasetVersion,
  rankingPolicyVersion: input.evidence.rankingPolicyVersion,
});

export const assertOpenAiReaderSummaryDraftShape = (
  draft: GeneratedReaderSummaryDraft,
): void => {
  if (
    draft.headline.trim().length === 0 ||
    draft.executiveSummary.trim().length === 0
  ) {
    throw new Error(
      "Reader summary draft must include headline and executive summary",
    );
  }
  if (draft.confidence.score < 0 || draft.confidence.score > 1) {
    throw new Error("Reader summary confidence score must be between 0 and 1");
  }
  if (
    draft.topStories.length === 0 &&
    !draft.qualityFlags.includes("no_signal")
  ) {
    throw new Error(
      "Reader summary draft without top stories must be marked no_signal",
    );
  }
};

export const extractOpenAiOutputText = (
  response: Record<string, unknown>,
): string | undefined => {
  if (
    typeof response.output_text === "string" &&
    response.output_text.trim().length > 0
  ) {
    return response.output_text;
  }

  for (const output of requiredArray<Record<string, unknown>>(
    response.output ?? [],
    "OpenAI output",
  )) {
    for (const content of requiredArray<Record<string, unknown>>(
      output.content ?? [],
      "OpenAI content",
    )) {
      if (typeof content.text === "string" && content.text.trim().length > 0) {
        return content.text;
      }
    }
  }

  return undefined;
};

export const resolveOpenAiReaderSummaryUsage = (
  response: Record<string, unknown>,
  fallback: ReaderSummaryModelEstimate,
): GeneratedReaderSummaryDraft["usage"] => {
  const usage = asRecord(response.usage);
  const inputTokens = numberOrFallback(
    usage?.input_tokens,
    fallback.inputTokens,
  );
  const outputTokens = numberOrFallback(
    usage?.output_tokens,
    fallback.outputTokens,
  );

  return {
    inputTokens,
    outputTokens,
    estimatedCostUsd: fallback.estimatedCostUsd,
  };
};

export const parseOpenAiReaderSummaryJsonObject = (
  value: string,
): Record<string, unknown> => {
  try {
    return requiredRecord(JSON.parse(value), "OpenAI reader summary output");
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "unknown parse failure";
    throw new Error(`OpenAI reader summary output must be JSON: ${detail}`);
  }
};

export const classifyOpenAiReaderSummaryHttpFailure = (
  status: number,
  body: unknown,
): ReaderSummaryModelFailure => {
  const message =
    extractOpenAiErrorMessage(body) ??
    `OpenAI reader summary request failed with HTTP ${status}`;
  if (status === 429) {
    return { kind: "provider_rate_limited", retryable: true, message };
  }
  if (status === 400 || status === 413) {
    return { kind: "context_too_large", retryable: false, message };
  }
  if (status === 401 || status === 403) {
    return { kind: "provider_unavailable", retryable: false, message };
  }
  if (status >= 500) {
    return { kind: "provider_unavailable", retryable: true, message };
  }

  return { kind: "provider_unavailable", retryable: false, message };
};

export const readOpenAiResponseBody = async (
  response: Response,
): Promise<unknown> => {
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
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const buildLineage = buildOpenAiReaderSummaryLineage;

const normalizeTopStory = (
  value: Record<string, unknown>,
): ReaderSummaryTopStory => ({
  storyClusterId: requiredString(value.storyClusterId, "top story cluster id"),
  title: requiredString(value.title, "top story title"),
  summary: requiredString(value.summary, "top story summary"),
  topicIds: requiredStringArray(value.topicIds, "top story topics"),
  providerKeys: requiredStringArray(value.providerKeys, "top story providers"),
  citationIds: requiredStringArray(value.citationIds, "top story citations"),
});

const normalizeTopicHighlight = (
  value: Record<string, unknown>,
): ReaderSummaryTopicHighlight => ({
  topicId: requiredString(value.topicId, "topic highlight topic id"),
  title: requiredString(value.title, "topic highlight title"),
  summary: requiredString(value.summary, "topic highlight summary"),
  citationIds: requiredStringArray(
    value.citationIds,
    "topic highlight citations",
  ),
});

const normalizeRepeatedSignal = (
  value: Record<string, unknown>,
): ReaderSummaryRepeatedSignal => ({
  storyClusterId: requiredString(
    value.storyClusterId,
    "repeated signal cluster id",
  ),
  title: requiredString(value.title, "repeated signal title"),
  topicIds: requiredStringArray(value.topicIds, "repeated signal topics"),
  citationIds: requiredStringArray(
    value.citationIds,
    "repeated signal citations",
  ),
});

const normalizeRisk = (value: Record<string, unknown>): ReaderSummaryRisk => ({
  description: requiredString(value.description, "risk description"),
  citationIds: requiredOptionalStringArray(value.citationIds, "risk citations"),
  reason: normalizeSetValue(value.reason, riskReasons, "risk reason"),
});

const normalizeCitation = (
  value: Record<string, unknown>,
): ReaderSummaryCitation => ({
  citationId: requiredString(value.citationId, "citation id"),
  feedItemId: requiredString(value.feedItemId, "citation feed item id"),
  sourceItemId: requiredString(value.sourceItemId, "citation source item id"),
  providerKey: requiredString(value.providerKey, "citation provider key"),
  field:
    normalizeSetValue(value.field, citationFields, "citation field") ?? "title",
});

const withEvidenceCanonicalUrls = (
  citations: readonly ReaderSummaryCitation[],
  evidenceItems: ReaderSummaryModelInput["evidence"]["selectedEvidence"],
): readonly ReaderSummaryCitation[] => {
  const canonicalUrlByFeedItemId = new Map(
    evidenceItems.map((item) => [item.feedItemId, item.canonicalUrl] as const),
  );

  return citations.map((citation) => ({
    ...citation,
    canonicalUrl: canonicalUrlByFeedItemId.get(citation.feedItemId),
  }));
};

const normalizeConfidence = (
  value: Record<string, unknown>,
): ReaderSummaryConfidence => ({
  level:
    normalizeSetValue(value.level, confidenceLevels, "confidence level") ??
    "low",
  score: requiredNumber(value.score, "confidence score"),
  rationale: requiredString(value.rationale, "confidence rationale"),
});

const normalizeQualityFlags = (
  value: unknown,
): readonly ReaderSummaryQualityFlag[] =>
  requiredOptionalStringArray(value, "quality flags")
    .map((flag) => normalizeSetValue(flag, qualityFlags, "quality flag"))
    .filter((flag): flag is ReaderSummaryQualityFlag => flag !== undefined);

const requiredString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }

  return value.trim();
};

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;

const requiredNumber = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
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

const requiredStringArray = (
  value: unknown,
  label: string,
): readonly string[] =>
  requiredArray<unknown>(value, label).map((item) =>
    requiredString(item, label),
  );

const requiredOptionalStringArray = (
  value: unknown,
  label: string,
): readonly string[] =>
  value === undefined || value === null
    ? []
    : requiredStringArray(value, label);

const requiredRecord = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
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
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string" || !allowed.has(value as T)) {
    throw new Error(`Unsupported ${label}`);
  }

  return value as T;
};

const numberOrFallback = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;

const extractOpenAiErrorMessage = (body: unknown): string | undefined => {
  const record = asRecord(body);
  const error = asRecord(record?.error);
  return typeof error?.message === "string" ? error.message : undefined;
};
