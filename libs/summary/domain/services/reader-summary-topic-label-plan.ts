import type { ReaderSummaryCitation } from "../entities/citation";
import type { ReaderSummaryTopicMapGenerator } from "../entities/reader-summary-topic-map";
import type { TopReadCandidate } from "../entities/top-read";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import type { ReaderSummaryTopicSemanticLabel } from "./reader-summary-topic-claim-label-policy";

export type ReaderSummaryTopicLabelPlan = {
  readonly nodeLabels: readonly ReaderSummaryTopicNodeLabel[];
  readonly groups: readonly ReaderSummaryTopicGroupLabel[];
  readonly warnings?: readonly string[];
};

export type ReaderSummaryTopicNodeLabel = {
  readonly nodeId: string;
  readonly topicId?: string;
  /** Internal reconciliation lineage; never parsed from model output. */
  readonly relationIdentity?: {
    readonly source: "topic-relation-reconciliation";
    readonly canonicalNodeId: string;
  };
  readonly label?: string;
  readonly semantic?: ReaderSummaryTopicSemanticLabel;
  /** Normalizer-owned assignment lineage; never read from a model lineage field. */
  readonly originalGroupId?: string;
  readonly groupId?: string;
  readonly keywords?: readonly string[];
  readonly rationale?: string;
};

export type ReaderSummaryTopicGroupLabel = {
  readonly id: string;
  readonly label: string;
  /** Accepted cohort identity display; final rendering must recheck grounding. */
  readonly recoveredDisplayLabel?: string;
  readonly semanticAnchors?: readonly string[];
  readonly nodeIds?: readonly string[];
  readonly confidenceScore?: number;
  readonly rationale?: string;
};

export type BuildReaderSummaryTopicMapParams = {
  readonly clusters: readonly StoryCluster[];
  readonly selectedEvidence: readonly SummaryEvidenceItem[];
  readonly topStories: readonly TopReadCandidate[];
  readonly citationMap: readonly ReaderSummaryCitation[];
  readonly labelPlan?: ReaderSummaryTopicLabelPlan;
  readonly generatedBy?: ReaderSummaryTopicMapGenerator;
  readonly warnings?: readonly string[];
  readonly preserveStoryClustersForLabeling?: boolean;
};
