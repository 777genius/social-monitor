import type {
  ReaderSummaryContextArtifact,
  StoryCluster,
} from "../../../domain";

export type SerializedReaderSummarySourceWindow = {
  readonly windowId?: unknown;
  readonly startedAt?: unknown;
  readonly endedAt?: unknown;
  readonly selectedFeedItemIds?: unknown;
  readonly storyClusterIds?: unknown;
};

export type SerializedReaderSummaryStoryCluster = Omit<
  StoryCluster,
  "observedAtRange"
> & {
  readonly observedAtRange?: {
    readonly startedAt?: unknown;
    readonly endedAt?: unknown;
  };
};

export type SerializedReaderSummaryContextArtifact = Omit<
  ReaderSummaryContextArtifact,
  "generatedAt" | "period"
> & {
  readonly period?: unknown;
  readonly generatedAt?: unknown;
};

export type SerializedReaderSummaryPeriod = {
  readonly cadence?: unknown;
  readonly startedAt?: unknown;
  readonly endedAt?: unknown;
  readonly timezone?: unknown;
};

export type SerializedReaderSummaryArtifactPayload = {
  readonly schemaVersion?: unknown;
  readonly period?: unknown;
  readonly userId?: unknown;
  readonly subscriptionId?: unknown;
  readonly generatedAt?: unknown;
  readonly sourceWindow?: SerializedReaderSummarySourceWindow | unknown;
  readonly storyClusters?: unknown;
  readonly contextArtifacts?: unknown;
  readonly personalization?: unknown;
  readonly headline?: unknown;
  readonly executiveSummary?: unknown;
  readonly readerBrief?: unknown;
  readonly content?: unknown;
  readonly topStories?: unknown;
  readonly interestHighlights?: unknown;
  readonly repeatedSignals?: unknown;
  readonly risksAndUnknowns?: unknown;
  readonly citationMap?: unknown;
  readonly qualityFlags?: unknown;
  readonly confidence?: unknown;
  readonly lineage?: unknown;
  readonly usage?: unknown;
  readonly noSignalReason?: unknown;
};
