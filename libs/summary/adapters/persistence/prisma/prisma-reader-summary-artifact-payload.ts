import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  buildReaderSummaryPeriod,
  type ReaderSummaryArtifactProps,
  type ReaderSummaryCadence,
  type ReaderSummaryCitation,
  type ReaderSummaryConfidence,
  type ReaderSummaryContent,
  type ReaderSummaryClaim,
  type ReaderSummaryContextArtifact,
  emptyReaderSummaryTopicMap,
  emptyReaderSummaryReliabilityReport,
  type ReaderSummaryItem,
  type ReaderSummaryLineage,
  type ReaderSummaryPeriod,
  type ReaderSummaryRepeatedSignal,
  type ReaderSummaryRisk,
  type ReaderSummaryScope,
  type ReaderSummaryInterestHighlight,
  type ReaderSummaryTopStory,
  type ReaderSummaryUsage,
  type SummaryEvidencePersonalization,
  type StoryCluster,
} from "../../../domain";
import {
  nonNegativeNumber,
  normalizeOptionalString,
  requireArray,
  requireDate,
  requireObject,
  requireString,
  requireStringArray,
} from "./prisma-reader-summary-payload-parsers";
import type {
  SerializedReaderSummaryArtifactPayload,
  SerializedReaderSummaryContextArtifact,
  SerializedReaderSummaryPeriod,
  SerializedReaderSummarySourceWindow,
  SerializedReaderSummaryStoryCluster,
} from "./prisma-reader-summary-payload-types";

export type PrismaReaderSummaryArtifactPayloadFallback = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly scopeType: string;
  readonly interestId: string | null;
  readonly cadence: string;
  readonly periodStartedAt: Date;
  readonly periodEndedAt: Date;
  readonly periodTimezone: string;
  readonly userId: string | null;
  readonly subscriptionId: string | null;
  readonly headline: string;
  readonly summaryText: string | null;
  readonly createdAt: Date;
};

export const readerSummaryScopeFromPrisma = (record: {
  readonly scopeType: string;
  readonly interestId: string | null;
}): ReaderSummaryScope => {
  if (record.scopeType === "workspace") {
    return { type: "workspace" };
  }

  if (record.scopeType === "interest" && record.interestId !== null) {
    return { type: "interest", interestId: record.interestId };
  }

  throw new Error(`Unsupported summary scope "${record.scopeType}"`);
};

export const normalizeReaderSummaryArtifactPayload = (
  payload: unknown,
  fallback: PrismaReaderSummaryArtifactPayloadFallback,
): ReaderSummaryArtifactProps => {
  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    throw new Error("Reader summary artifact payload must be an object");
  }

  const value = payload as SerializedReaderSummaryArtifactPayload;
  const sourceWindow = value.sourceWindow;

  if (
    sourceWindow === undefined ||
    sourceWindow === null ||
    typeof sourceWindow !== "object" ||
    Array.isArray(sourceWindow)
  ) {
    throw new Error("Reader summary artifact source window payload is invalid");
  }
  const serializedSourceWindow =
    sourceWindow as SerializedReaderSummarySourceWindow;
  const period = normalizeReaderSummaryPeriodPayload(value.period, fallback);

  return {
    schemaVersion: normalizeReaderSummaryArtifactSchemaVersion(
      value.schemaVersion,
    ),
    readerSummaryId: fallback.id,
    tenantId: tenantId(fallback.tenantId),
    workspaceId: workspaceId(fallback.workspaceId),
    scope: readerSummaryScopeFromPrisma(fallback),
    period,
    userId:
      normalizeOptionalString(value.userId) ?? fallback.userId ?? undefined,
    subscriptionId:
      normalizeOptionalString(value.subscriptionId) ??
      fallback.subscriptionId ??
      undefined,
    generatedAt: requireDate(
      value.generatedAt ?? fallback.createdAt,
      "Reader summary generation date",
    ),
    sourceWindow: {
      windowId: requireString(
        serializedSourceWindow.windowId,
        "Reader summary source window id",
      ),
      startedAt: requireDate(
        serializedSourceWindow.startedAt,
        "Reader summary source window start",
      ),
      endedAt: requireDate(
        serializedSourceWindow.endedAt,
        "Reader summary source window end",
      ),
      selectedFeedItemIds: requireStringArray(
        serializedSourceWindow.selectedFeedItemIds,
        "Reader summary source window selected feed ids",
      ),
      storyClusterIds: requireStringArray(
        serializedSourceWindow.storyClusterIds,
        "Reader summary source window story cluster ids",
      ),
    },
    storyClusters: requireArray<SerializedReaderSummaryStoryCluster>(
      value.storyClusters,
      "Reader summary story clusters",
    ).map(normalizeReaderSummaryStoryCluster),
    contextArtifacts: requireArray<SerializedReaderSummaryContextArtifact>(
      value.contextArtifacts,
      "Reader summary context artifacts",
    ).map(normalizeReaderSummaryContextArtifact),
    personalization: normalizeReaderSummaryPersonalization(
      value.personalization,
    ),
    headline: requireString(
      value.headline ?? fallback.headline,
      "Reader summary headline",
    ),
    executiveSummary: requireString(
      value.executiveSummary ?? fallback.summaryText ?? "",
      "Reader summary text",
    ),
    content: normalizeReaderSummaryContent(value.content ?? value.readerBrief),
    topStories: requireArray<ReaderSummaryTopStory>(
      value.topStories,
      "Reader summary top stories",
    ),
    interestHighlights: requireArray<ReaderSummaryInterestHighlight>(
      value.interestHighlights,
      "Reader summary interest highlights",
    ),
    repeatedSignals: requireArray<ReaderSummaryRepeatedSignal>(
      value.repeatedSignals,
      "Reader summary repeated signals",
    ),
    risksAndUnknowns: requireArray<ReaderSummaryRisk>(
      value.risksAndUnknowns,
      "Reader summary risks",
    ),
    citationMap: requireArray<ReaderSummaryCitation>(
      value.citationMap,
      "Reader summary citation map",
    ),
    qualityFlags: requireArray(
      value.qualityFlags,
      "Reader summary quality flags",
    ),
    confidence: requireObject<ReaderSummaryConfidence>(
      value.confidence,
      "Reader summary confidence",
    ),
    lineage: normalizeReaderSummaryLineage(value.lineage),
    usage: requireObject<ReaderSummaryUsage>(
      value.usage,
      "Reader summary usage",
    ),
    noSignalReason: normalizeOptionalString(value.noSignalReason),
  };
};

const normalizeReaderSummaryStoryCluster = (
  value: SerializedReaderSummaryStoryCluster,
): StoryCluster => ({
  ...requireObject<Omit<StoryCluster, "observedAtRange">>(
    value,
    "Reader summary story cluster",
  ),
  observedAtRange: {
    startedAt: requireDate(
      value.observedAtRange?.startedAt,
      "Reader summary story cluster start",
    ),
    endedAt: requireDate(
      value.observedAtRange?.endedAt,
      "Reader summary story cluster end",
    ),
  },
});

const normalizeReaderSummaryContextArtifact = (
  value: SerializedReaderSummaryContextArtifact,
): ReaderSummaryContextArtifact => ({
  ...requireObject<
    Omit<ReaderSummaryContextArtifact, "generatedAt" | "period">
  >(value, "Reader summary context artifact"),
  period: normalizeReaderSummaryPeriodPayload(value.period, {
    cadence: "daily",
    periodStartedAt: new Date("1970-01-01T00:00:00.000Z"),
    periodEndedAt: new Date("1970-01-02T00:00:00.000Z"),
    periodTimezone: "UTC",
  }),
  generatedAt: requireDate(
    value.generatedAt,
    "Reader summary context artifact generated date",
  ),
});

const normalizeReaderSummaryPeriodPayload = (
  value: unknown,
  fallback: Pick<
    PrismaReaderSummaryArtifactPayloadFallback,
    "cadence" | "periodStartedAt" | "periodEndedAt" | "periodTimezone"
  >,
): ReaderSummaryPeriod => {
  if (value === undefined) {
    return buildReaderSummaryPeriod({
      cadence: normalizeReaderSummaryCadence(fallback.cadence),
      startedAt: fallback.periodStartedAt,
      endedAt: fallback.periodEndedAt,
      timezone: fallback.periodTimezone,
    });
  }

  const period = requireObject<SerializedReaderSummaryPeriod>(
    value,
    "Reader summary period",
  );

  return buildReaderSummaryPeriod({
    cadence: normalizeReaderSummaryCadence(period.cadence),
    startedAt: requireDate(period.startedAt, "Reader summary period start"),
    endedAt: requireDate(period.endedAt, "Reader summary period end"),
    timezone: requireString(period.timezone, "Reader summary period timezone"),
  });
};

const normalizeReaderSummaryCadence = (
  value: unknown,
): ReaderSummaryCadence => {
  if (
    value === "daily" ||
    value === "weekly" ||
    value === "monthly" ||
    value === "custom"
  ) {
    return value;
  }

  throw new Error(`Unsupported reader summary cadence "${String(value)}"`);
};

const normalizeReaderSummaryPersonalization = (
  value: unknown,
): SummaryEvidencePersonalization | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const personalization = requireObject<SummaryEvidencePersonalization>(
    value,
    "Reader summary personalization",
  );
  const status = personalization.memoryGuidanceStatus;

  if (
    status !== "disabled" &&
    status !== "available" &&
    status !== "empty" &&
    status !== "unavailable"
  ) {
    return undefined;
  }

  return {
    memoryGuidanceStatus: status,
    memoryGuidanceApplied: personalization.memoryGuidanceApplied === true,
    providerPreferenceCount: nonNegativeNumber(
      personalization.providerPreferenceCount,
    ),
    keywordPreferenceCount: nonNegativeNumber(
      personalization.keywordPreferenceCount,
    ),
    mutedKeywordCount: nonNegativeNumber(personalization.mutedKeywordCount),
    blockedProviderCount: nonNegativeNumber(
      personalization.blockedProviderCount,
    ),
    signals: requireStringArray(
      personalization.signals,
      "Reader summary personalization signals",
    ),
  };
};

const normalizeReaderSummaryContent = (
  value: unknown,
): ReaderSummaryContent | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const content = requireObject<ReaderSummaryContent>(
    value,
    "Reader summary content",
  );
  if (
    content.qualityState === undefined ||
    content.topReads.some(
      (item) =>
        item.whyNow === undefined ||
        item.matchedInterestIds === undefined ||
        item.matchedRules === undefined ||
        item.confidence === undefined ||
        item.confirmedProviderKeys === undefined ||
        item.providerMetrics === undefined ||
        item.whyImportant === undefined,
    )
  ) {
    return undefined;
  }

  return {
    ...content,
    mainTopics: normalizeReaderSummaryMainTopics(content.mainTopics),
    narrativeSections: content.narrativeSections ?? [],
    topicMap: content.topicMap ?? emptyReaderSummaryTopicMap(),
    topReads: content.topReads.map(normalizeReaderSummaryItem),
    selectedPosts: normalizeReaderSummarySelectedPosts(
      content.selectedPosts,
      content.topReads,
    ),
    claimBoard: normalizeReaderSummaryClaimBoard(content.claimBoard),
    reliabilityReport:
      content.reliabilityReport ?? emptyReaderSummaryReliabilityReport(),
    interestSections: content.interestSections.map((section) => ({
      ...section,
      items: section.items.map(normalizeReaderSummaryItem),
    })),
  };
};

const normalizeReaderSummaryMainTopics = (
  value: readonly string[] | undefined,
): readonly string[] =>
  value === undefined
    ? []
    : value.map((topic) => topic.trim()).filter((topic) => topic.length > 0);

const normalizeReaderSummarySelectedPosts = (
  value: readonly ReaderSummaryItem[] | undefined,
  fallbackTopReads: readonly ReaderSummaryItem[],
): readonly ReaderSummaryItem[] =>
  (value ?? fallbackTopReads).map(normalizeReaderSummaryItem);

const normalizeReaderSummaryItem = (
  item: ReaderSummaryItem,
): ReaderSummaryItem => ({
  ...item,
  providerName: item.providerName ?? item.providerKey,
  primaryActionKind:
    item.primaryActionKind === "watch_repository"
      ? "watch_repository"
      : "read_source",
});

const normalizeReaderSummaryClaimBoard = (
  value: unknown,
): readonly ReaderSummaryClaim[] => {
  if (value === undefined) {
    return [];
  }

  return requireArray<ReaderSummaryClaim>(value, "Reader summary claim board");
};

const normalizeReaderSummaryArtifactSchemaVersion = (
  value: unknown,
): "reader_summary.artifact.v1" => {
  if (
    value === "reader_summary.artifact.v1" ||
    value === "reader_summary.artifact.v1"
  ) {
    return "reader_summary.artifact.v1";
  }

  throw new Error(
    "Reader summary schema version must be reader_summary.artifact.v1",
  );
};

const normalizeReaderSummaryLineage = (
  value: unknown,
): ReaderSummaryLineage => {
  const lineage = requireObject<ReaderSummaryLineage>(
    value,
    "Reader summary lineage",
  );

  return {
    ...lineage,
    schemaVersion: "reader_summary.artifact.v1",
  };
};
