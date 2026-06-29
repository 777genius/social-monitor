import type {
  ReaderSummaryCitation,
  ReaderSummaryNextAction,
  ReaderSummaryProviderMetric,
  ReaderSummaryQualityFlag,
  ReaderSummaryContent,
  ReaderSummaryItem,
  ReaderSummaryInterestSection,
  ReaderSummarySourceMixEntry,
  ReaderSummaryTrendDelta,
} from "../../domain";

const nextActionKinds = new Set<ReaderSummaryNextAction["kind"]>([
  "read_source",
  "watch_repository",
  "monitor_interest",
  "compare_sources",
  "ignore_low_confidence",
  "add_interest_rule",
  "request_deeper_scan",
  "mark_relevant",
  "mark_not_relevant",
]);

const qualityFlags = new Set<ReaderSummaryQualityFlag>([
  "no_signal",
  "low_confidence",
  "conflicting_evidence",
  "limited_sources",
  "partial_evidence",
  "context_unavailable",
  "provider_failed",
]);

const qualityStatuses = new Set<ReaderSummaryContent["qualityState"]["status"]>(
  [
    "ready",
    "partial",
    "limited_sources",
    "low_confidence",
    "no_signal",
    "failed_provider",
  ],
);

export const openAiReaderSummaryContentJsonSchemaDefs = {
  content: readerObjectSchema(
    [
      "headline",
      "oneLineTakeaway",
      "bullets",
      "interestSections",
      "sourceMix",
      "topReads",
      "trendDelta",
      "openQuestions",
      "risks",
      "nextActions",
    ],
    {
      headline: readerStringSchema(160),
      oneLineTakeaway: readerStringSchema(260),
      bullets: readerStringArraySchema(0),
      interestSections: {
        type: "array",
        items: { $ref: "#/$defs/readerInterestSection" },
        maxItems: 0,
      },
      sourceMix: {
        type: "array",
        items: { $ref: "#/$defs/sourceMixEntry" },
        maxItems: 0,
      },
      topReads: {
        type: "array",
        items: { $ref: "#/$defs/readerItem" },
        maxItems: 0,
      },
      trendDelta: { $ref: "#/$defs/trendDelta" },
      openQuestions: readerStringArraySchema(0),
      risks: readerStringArraySchema(0),
      nextActions: {
        type: "array",
        items: { $ref: "#/$defs/nextAction" },
        maxItems: 0,
      },
    },
  ),
  readerInterestSection: readerObjectSchema(
    ["title", "insight", "items", "citationIds", "interestId"],
    {
      interestId: { type: ["string", "null"] },
      title: readerStringSchema(140),
      insight: readerStringSchema(280),
      items: {
        type: "array",
        items: { $ref: "#/$defs/readerItem" },
        maxItems: 3,
      },
      citationIds: readerStringArraySchema(3),
    },
  ),
  readerItem: readerObjectSchema(
    ["title", "providerKey", "reason", "canonicalUrl", "citationIds"],
    {
      title: readerStringSchema(180),
      providerKey: readerStringSchema(80),
      reason: readerStringSchema(280),
      canonicalUrl: { type: ["string", "null"] },
      citationIds: readerStringArraySchema(2),
    },
  ),
  sourceMixEntry: readerObjectSchema(
    ["providerKey", "itemCount", "citationCount"],
    {
      providerKey: readerStringSchema(80),
      itemCount: { type: "number", minimum: 0 },
      citationCount: { type: "number", minimum: 0 },
    },
  ),
  trendDelta: readerObjectSchema(
    ["newSignals", "growingSignals", "repeatedSignals", "fadingSignals"],
    {
      newSignals: readerStringArraySchema(0),
      growingSignals: readerStringArraySchema(0),
      repeatedSignals: readerStringArraySchema(0),
      fadingSignals: readerStringArraySchema(0),
    },
  ),
  nextAction: readerObjectSchema(
    ["kind", "label", "reason", "citationIds", "canonicalUrl"],
    {
      kind: { enum: [...nextActionKinds] },
      label: readerStringSchema(120),
      reason: readerStringSchema(240),
      citationIds: readerStringArraySchema(2),
      canonicalUrl: { type: ["string", "null"] },
    },
  ),
} as const;

export const normalizeOpenAiReaderBrief = (
  value: Record<string, unknown>,
  citationMap: readonly ReaderSummaryCitation[],
): ReaderSummaryContent => {
  const citationById = new Map(
    citationMap.map((citation) => [citation.citationId, citation] as const),
  );
  const sourceMix = requiredArray<Record<string, unknown>>(
    value.sourceMix,
    "reader summary content source mix",
  ).map(normalizeSourceMixEntry);

  return {
    headline: requiredString(value.headline, "reader summary content headline"),
    oneLineTakeaway: requiredString(
      value.oneLineTakeaway,
      "reader summary content takeaway",
    ),
    bullets: requiredStringArray(
      value.bullets,
      "reader summary content bullets",
    ),
    qualityState: normalizeQualityState(value.qualityState, sourceMix),
    interestSections: requiredArray<Record<string, unknown>>(
      value.interestSections,
      "reader summary content interest sections",
    ).map((section) => normalizeReaderInterestSection(section, citationById)),
    sourceMix,
    topReads: requiredArray<Record<string, unknown>>(
      value.topReads,
      "reader summary content top reads",
    ).map((item) => normalizeReaderItem(item, citationById)),
    trendDelta: normalizeTrendDelta(
      requiredRecord(value.trendDelta, "reader summary content trend delta"),
    ),
    openQuestions: requiredStringArray(
      value.openQuestions,
      "reader summary content open questions",
    ),
    risks: requiredStringArray(value.risks, "reader summary content risks"),
    nextActions: requiredArray<Record<string, unknown>>(
      value.nextActions,
      "reader summary content next actions",
    ).map((action) => normalizeNextAction(action, citationById)),
  };
};

const normalizeReaderInterestSection = (
  value: Record<string, unknown>,
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
): ReaderSummaryInterestSection => ({
  interestId: optionalString(value.interestId),
  title: requiredString(value.title, "reader interest title"),
  insight: requiredString(value.insight, "reader interest insight"),
  items: requiredArray<Record<string, unknown>>(
    value.items,
    "reader interest items",
  ).map((item) => normalizeReaderItem(item, citationById)),
  citationIds: requiredStringArray(value.citationIds, "reader interest citations"),
});

const normalizeReaderItem = (
  value: Record<string, unknown>,
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
): ReaderSummaryItem => {
  const citationIds = requiredStringArray(
    value.citationIds,
    "reader item citations",
  );
  const trustedCitation = citationIds
    .map((citationId) => citationById.get(citationId))
    .find(Boolean);
  const providerKey =
    trustedCitation?.providerKey ??
    requiredString(value.providerKey, "reader item provider");
  const reason = requiredString(value.reason, "reader item reason");
  const signalScore = nonNegativeNumberOrFallback(value.signalScore, 0);

  return {
    title: requiredString(value.title, "reader item title"),
    providerKey,
    providerName: providerKey,
    primaryActionKind: "read_source",
    reason,
    matchedInterestIds:
      optionalStringArray(value.matchedInterestIds).length > 0
        ? optionalStringArray(value.matchedInterestIds)
        : ["unknown-interest"],
    matchedRules:
      optionalStringArray(value.matchedRules).length > 0
        ? optionalStringArray(value.matchedRules)
        : [`provider:${providerKey}`],
    signalScore,
    confidence: {
      level: signalScore >= 1 ? "medium" : "low",
      score: signalScore >= 1 ? 0.5 : 0.35,
      rationale:
        "Model-provided reader item normalized without story clustering evidence.",
    },
    confirmedProviderKeys: [providerKey],
    providerMetrics: optionalArray<Record<string, unknown>>(
      value.providerMetrics,
    ).map(normalizeProviderMetric),
    whyImportant:
      optionalStringArray(value.whyImportant).length > 0
        ? optionalStringArray(value.whyImportant)
        : [reason],
    whyNow:
      optionalString(value.whyNow) ?? "Selected in the current summary window.",
    canonicalUrl: trustedCitation?.canonicalUrl,
    citationIds,
  };
};

const normalizeSourceMixEntry = (
  value: Record<string, unknown>,
): ReaderSummarySourceMixEntry => ({
  providerKey: requiredString(value.providerKey, "source mix provider"),
  itemCount: requiredNumber(value.itemCount, "source mix item count"),
  citationCount: requiredNumber(
    value.citationCount,
    "source mix citation count",
  ),
  storyClusterCount: nonNegativeNumberOrFallback(value.storyClusterCount, 0),
  crossSourceClusterCount: nonNegativeNumberOrFallback(
    value.crossSourceClusterCount,
    0,
  ),
  singleSourceOnly:
    typeof value.singleSourceOnly === "boolean" ? value.singleSourceOnly : true,
  interestIds: optionalStringArray(value.interestIds),
});

const normalizeTrendDelta = (
  value: Record<string, unknown>,
): ReaderSummaryTrendDelta => ({
  newSignals: requiredStringArray(value.newSignals, "trend delta new signals"),
  growingSignals: requiredStringArray(
    value.growingSignals,
    "trend delta growing signals",
  ),
  repeatedSignals: requiredStringArray(
    value.repeatedSignals,
    "trend delta repeated signals",
  ),
  fadingSignals: requiredStringArray(
    value.fadingSignals,
    "trend delta fading signals",
  ),
});

const normalizeNextAction = (
  value: Record<string, unknown>,
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
): ReaderSummaryNextAction => {
  const citationIds = requiredStringArray(
    value.citationIds,
    "next action citations",
  );
  const trustedCitation = citationIds
    .map((citationId) => citationById.get(citationId))
    .find(Boolean);

  return {
    kind:
      normalizeSetValue(value.kind, nextActionKinds, "next action kind") ??
      "read_source",
    label: requiredString(value.label, "next action label"),
    reason: requiredString(value.reason, "next action reason"),
    citationIds,
    canonicalUrl: trustedCitation?.canonicalUrl,
  };
};

const normalizeQualityState = (
  value: unknown,
  sourceMix: readonly ReaderSummarySourceMixEntry[],
): ReaderSummaryContent["qualityState"] => {
  const record =
    value === undefined
      ? undefined
      : requiredRecord(value, "reader summary content quality state");
  const flags = optionalStringArray(record?.flags)
    .map((flag) => normalizeSetValue(flag, qualityFlags, "reader quality flag"))
    .filter((flag): flag is ReaderSummaryQualityFlag => flag !== undefined);
  const isSingleSource =
    typeof record?.isSingleSource === "boolean"
      ? record.isSingleSource
      : sourceMix.length === 1 ||
        sourceMix.every((source) => source.singleSourceOnly);
  const rawStatus = normalizeSetValue(
    record?.status,
    qualityStatuses,
    "reader quality status",
  );
  const status =
    rawStatus === "ready" && isSingleSource
      ? "limited_sources"
      : (rawStatus ?? (isSingleSource ? "limited_sources" : "ready"));
  const normalizedFlags = isSingleSource
    ? uniqueStrings([...flags, "limited_sources"])
    : flags;
  const warnings = optionalStringArray(record?.warnings);

  return {
    status,
    flags: normalizedFlags,
    warnings:
      isSingleSource && warnings.length === 0
        ? [
            "Source coverage needs confirmation from another monitored provider.",
          ]
        : warnings,
    isSingleSource,
  };
};

const uniqueStrings = <T extends string>(
  values: readonly T[],
): readonly T[] => [...new Set(values)];

const normalizeProviderMetric = (
  value: Record<string, unknown>,
): ReaderSummaryProviderMetric => ({
  label: requiredString(value.label, "provider metric label"),
  value: requiredString(value.value, "provider metric value"),
});

function readerObjectSchema(
  required: readonly string[],
  properties: Record<string, unknown>,
) {
  return {
    type: "object",
    additionalProperties: false,
    required,
    properties,
  };
}

function readerStringSchema(maxLength: number) {
  return { type: "string", maxLength };
}

function readerStringArraySchema(maxItems = 10, maxLength = 160) {
  return { type: "array", items: readerStringSchema(maxLength), maxItems };
}

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

const optionalArray = <T>(value: unknown): readonly T[] =>
  Array.isArray(value) ? (value as T[]) : [];

const requiredStringArray = (
  value: unknown,
  label: string,
): readonly string[] =>
  requiredArray<unknown>(value, label).map((item) =>
    requiredString(item, label),
  );

const optionalStringArray = (value: unknown): readonly string[] =>
  optionalArray<unknown>(value)
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);

const requiredRecord = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value as Record<string, unknown>;
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

const nonNegativeNumberOrFallback = (
  value: unknown,
  fallback: number,
): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
