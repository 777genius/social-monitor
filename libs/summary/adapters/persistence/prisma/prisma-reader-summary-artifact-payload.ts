import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type {
  ReaderSummaryArtifactProps,
  ReaderSummaryCitation,
  ReaderSummaryConfidence,
  ReaderSummaryContent,
  ReaderSummaryContextArtifact,
  ReaderSummaryItem,
  ReaderSummaryLineage,
  ReaderSummaryRepeatedSignal,
  ReaderSummaryRisk,
  ReaderSummaryScope,
  ReaderSummaryTopicHighlight,
  ReaderSummaryTopStory,
  ReaderSummaryUsage,
  StoryCluster,
} from "../../../domain";

export type PrismaReaderSummaryArtifactPayloadFallback = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly scopeType: string;
  readonly topicId: string | null;
  readonly userId: string | null;
  readonly subscriptionId: string | null;
  readonly headline: string;
  readonly summaryText: string | null;
};

export const readerSummaryScopeFromPrisma = (record: {
  readonly scopeType: string;
  readonly topicId: string | null;
}): ReaderSummaryScope => {
  if (record.scopeType === "workspace") {
    return { type: "workspace" };
  }

  if (record.scopeType === "topic" && record.topicId !== null) {
    return { type: "topic", topicId: record.topicId };
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

  return {
    schemaVersion: normalizeReaderSummaryArtifactSchemaVersion(
      value.schemaVersion,
    ),
    readerSummaryId: fallback.id,
    tenantId: tenantId(fallback.tenantId),
    workspaceId: workspaceId(fallback.workspaceId),
    scope: readerSummaryScopeFromPrisma(fallback),
    userId:
      normalizeOptionalString(value.userId) ?? fallback.userId ?? undefined,
    subscriptionId:
      normalizeOptionalString(value.subscriptionId) ??
      fallback.subscriptionId ??
      undefined,
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
    topicHighlights: requireArray<ReaderSummaryTopicHighlight>(
      value.topicHighlights,
      "Reader summary topic highlights",
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
  ...requireObject<Omit<ReaderSummaryContextArtifact, "generatedAt">>(
    value,
    "Reader summary context artifact",
  ),
  generatedAt: requireDate(
    value.generatedAt,
    "Reader summary context artifact generated date",
  ),
});

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
        item.matchedTopicIds === undefined ||
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
    topReads: content.topReads.map(normalizeReaderSummaryItem),
    topicSections: content.topicSections.map((section) => ({
      ...section,
      items: section.items.map(normalizeReaderSummaryItem),
    })),
  };
};

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

const normalizeReaderSummaryArtifactSchemaVersion = (
  value: unknown,
): "reader_summary.artifact.v1" => {
  if (
    value === "reader_summary.artifact.v1" ||
    value === "briefing.artifact.v1"
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

const normalizeOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

type SerializedReaderSummarySourceWindow = {
  readonly windowId?: unknown;
  readonly startedAt?: unknown;
  readonly endedAt?: unknown;
  readonly selectedFeedItemIds?: unknown;
  readonly storyClusterIds?: unknown;
};

type SerializedReaderSummaryStoryCluster = Omit<
  StoryCluster,
  "observedAtRange"
> & {
  readonly observedAtRange?: {
    readonly startedAt?: unknown;
    readonly endedAt?: unknown;
  };
};

type SerializedReaderSummaryContextArtifact = Omit<
  ReaderSummaryContextArtifact,
  "generatedAt"
> & {
  readonly generatedAt?: unknown;
};

type SerializedReaderSummaryArtifactPayload = {
  readonly schemaVersion?: unknown;
  readonly userId?: unknown;
  readonly subscriptionId?: unknown;
  readonly sourceWindow?: SerializedReaderSummarySourceWindow | unknown;
  readonly storyClusters?: unknown;
  readonly contextArtifacts?: unknown;
  readonly headline?: unknown;
  readonly executiveSummary?: unknown;
  readonly readerBrief?: unknown;
  readonly content?: unknown;
  readonly topStories?: unknown;
  readonly topicHighlights?: unknown;
  readonly repeatedSignals?: unknown;
  readonly risksAndUnknowns?: unknown;
  readonly citationMap?: unknown;
  readonly qualityFlags?: unknown;
  readonly confidence?: unknown;
  readonly lineage?: unknown;
  readonly usage?: unknown;
  readonly noSignalReason?: unknown;
};

const requireString = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }

  return value;
};

const requireDate = (value: unknown, fieldName: string): Date => {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be an ISO date string`);
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} must be a valid ISO date`);
  }

  return parsed;
};

const requireStringArray = (
  value: unknown,
  fieldName: string,
): readonly string[] => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${fieldName} must be a string array`);
  }

  return value;
};

const requireArray = <T>(value: unknown, fieldName: string): readonly T[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  return value as readonly T[];
};

const requireObject = <T>(value: unknown, fieldName: string): T => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`);
  }

  return value as T;
};
