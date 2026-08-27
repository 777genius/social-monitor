import {
  buildReaderSummary,
  ReaderSummaryArtifact,
  type ReaderPostPromotionAttestation,
  type ReaderSummaryContextArtifact,
  type ReaderSummaryJob,
  type SummaryEvidenceSelection,
} from "../../domain";

const defaultNoSignalReason =
  "No evidence passed the immutable Promotion V1 eligibility policy.";

export const buildPromotionNoSignalArtifact = (params: {
  readonly snapshot: ReturnType<ReaderSummaryJob["toSnapshot"]>;
  readonly readerSummaryId: string;
  readonly generatedAt: Date;
  readonly evidence: SummaryEvidenceSelection;
  readonly promotionAttestations: readonly ReaderPostPromotionAttestation[];
  readonly contextArtifacts: readonly ReaderSummaryContextArtifact[];
  readonly noSignalReason?: string;
}): ReaderSummaryArtifact => {
  const noSignalReason = params.noSignalReason ?? defaultNoSignalReason;
  const citationMap = [] as const;
  const content = buildReaderSummary({
    headline: "No reliable workspace signal yet",
    executiveSummary: noSignalReason,
    topStories: [],
    interestHighlights: [],
    repeatedSignals: [],
    risksAndUnknowns: [],
    citationMap,
    storyClusters: params.evidence.clusters,
    sourceWindow: params.evidence.sourceWindow,
    selectedEvidence: [],
    qualityFlags: ["no_signal"],
    noSignalReason,
  });
  return ReaderSummaryArtifact.create({
    schemaVersion: "reader_summary.artifact.v1",
    readerSummaryId: params.readerSummaryId,
    tenantId: params.snapshot.tenantId,
    workspaceId: params.snapshot.workspaceId,
    scope: params.snapshot.scope,
    period: params.snapshot.period,
    userId: params.snapshot.userId,
    subscriptionId: params.snapshot.subscriptionId,
    generatedAt: params.generatedAt,
    sourceWindow: params.evidence.sourceWindow,
    storyClusters: params.evidence.clusters,
    relatedTopicRelations: [],
    promotionAttestations: params.promotionAttestations,
    promotionEvidenceFacts: [],
    contextArtifacts: params.contextArtifacts,
    personalization: params.evidence.personalization,
    headline: "No reliable workspace signal yet",
    executiveSummary: noSignalReason,
    content,
    topStories: [],
    interestHighlights: [],
    repeatedSignals: [],
    risksAndUnknowns: [],
    citationMap,
    qualityFlags: ["no_signal"],
    confidence: { level: "none", score: 0, rationale: noSignalReason },
    lineage: {
      promptVersion: "reader_summary.promotion_no_signal.v1",
      schemaVersion: "reader_summary.artifact.v1",
      modelVersion: "not_invoked",
      providerVersion: "deterministic",
      rulesVersion: "reader_post_promotion.v1",
      evalDatasetVersion: "reader_post_promotion.v1",
      rankingPolicyVersion: params.evidence.rankingPolicyVersion,
    },
    usage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 },
    noSignalReason,
  });
};
