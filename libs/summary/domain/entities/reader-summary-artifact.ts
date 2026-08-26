import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type { ReaderSummaryCitation } from "./citation";
import type { ReaderAction } from "./reader-action";
import type { ReaderSummarySnapshot } from "./reader-summary-snapshot";
import type { SourceMixEntry } from "./source-mix-entry";
import type {
  ReaderSummaryRisk,
  ReaderInterestSection,
  ReaderTrendDelta,
  RepeatedSignal,
  TopRead,
  TopReadCandidate,
  InterestHighlight,
} from "./top-read";
import type { ReaderSummaryScope } from "../value-objects/reader-summary-scope";
import type { ReaderSummaryPeriod } from "../value-objects/reader-summary-period";
import type { ProviderMetric } from "../value-objects/provider-metric-label";
import type {
  ReaderSummaryQualityFlag,
  ReaderSummaryQualityState,
} from "../value-objects/summary-quality";
import type {
  StoryCluster,
  SummaryEvidencePersonalization,
  SummarySourceWindow,
} from "../value-objects/summary-evidence-item";
import { assertReaderSummaryArtifactValid } from "./reader-summary-artifact-validation";
import { assertReaderSummaryCitationsAgainstEvidence } from "./reader-summary-citation-evidence-validation";

export { assertReaderSummaryCitationsAgainstEvidence };

export type ReaderSummaryProviderMetric = ProviderMetric;
export type ReaderSummaryTopStory = TopReadCandidate;
export type ReaderSummaryInterestHighlight = InterestHighlight;
export type ReaderSummaryRepeatedSignal = RepeatedSignal;
export type ReaderSummaryItemConfidence = TopRead["confidence"];
export type ReaderSummaryItem = TopRead;
export type ReaderSummaryInterestSection = ReaderInterestSection;
export type ReaderSummarySourceMixEntry = SourceMixEntry;
export type ReaderSummaryTrendDelta = ReaderTrendDelta;
export type ReaderSummaryNextAction = ReaderAction;
export type ReaderSummaryQualityStateSnapshot = ReaderSummaryQualityState;
export type ReaderSummaryContent = ReaderSummarySnapshot;

export type ReaderSummaryContextArtifact = {
  readonly artifactId: string;
  readonly scope: ReaderSummaryScope;
  readonly period: ReaderSummaryPeriod;
  readonly summaryText: string;
  readonly generatedAt: Date;
  readonly freshness: "fresh" | "stale" | "unknown";
};

export type ReaderSummaryLineage = {
  readonly promptVersion: string;
  readonly schemaVersion: "reader_summary.artifact.v1";
  readonly modelVersion: string;
  readonly providerVersion: string;
  readonly rulesVersion: string;
  readonly evalDatasetVersion: string;
  readonly rankingPolicyVersion?: string;
};

export type ReaderSummaryUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostUsd: number;
};

export type ReaderSummaryConfidence = {
  readonly level: "none" | "low" | "medium" | "high";
  readonly score: number;
  readonly rationale: string;
};

export type ReaderSummaryArtifactProps = {
  readonly schemaVersion: "reader_summary.artifact.v1";
  readonly readerSummaryId: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope: ReaderSummaryScope;
  readonly period: ReaderSummaryPeriod;
  readonly userId?: string;
  readonly subscriptionId?: string;
  readonly generatedAt?: Date;
  readonly sourceWindow: SummarySourceWindow;
  readonly storyClusters: readonly StoryCluster[];
  readonly contextArtifacts: readonly ReaderSummaryContextArtifact[];
  readonly personalization?: SummaryEvidencePersonalization;
  readonly headline: string;
  readonly executiveSummary: string;
  readonly content?: ReaderSummaryContent;
  readonly topStories: readonly ReaderSummaryTopStory[];
  readonly interestHighlights: readonly ReaderSummaryInterestHighlight[];
  readonly repeatedSignals: readonly ReaderSummaryRepeatedSignal[];
  readonly risksAndUnknowns: readonly ReaderSummaryRisk[];
  readonly citationMap: readonly ReaderSummaryCitation[];
  readonly qualityFlags: readonly ReaderSummaryQualityFlag[];
  readonly confidence: ReaderSummaryConfidence;
  readonly lineage: ReaderSummaryLineage;
  readonly usage: ReaderSummaryUsage;
  readonly noSignalReason?: string;
};

export type GeneratedReaderSummaryDraft = Omit<
  ReaderSummaryArtifactProps,
  | "schemaVersion"
  | "readerSummaryId"
  | "tenantId"
  | "workspaceId"
  | "scope"
  | "period"
  | "userId"
  | "subscriptionId"
  | "sourceWindow"
  | "storyClusters"
  | "contextArtifacts"
  | "personalization"
> & {
  readonly lineage: ReaderSummaryLineage;
  readonly usage: ReaderSummaryUsage;
};

export class ReaderSummaryArtifact {
  private constructor(private readonly props: ReaderSummaryArtifactProps) {}

  static create(props: ReaderSummaryArtifactProps): ReaderSummaryArtifact {
    assertReaderSummaryArtifactValid(props);

    return new ReaderSummaryArtifact(props);
  }

  static rehydrate(props: ReaderSummaryArtifactProps): ReaderSummaryArtifact {
    assertReaderSummaryArtifactValid(props);

    return new ReaderSummaryArtifact(props);
  }

  toSnapshot(): ReaderSummaryArtifactProps {
    return { ...this.props };
  }
}
