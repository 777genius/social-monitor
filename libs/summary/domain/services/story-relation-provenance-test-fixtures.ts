import type { ApprovedSameStoryRelation, SummarySourceWindow } from
  "../value-objects/summary-evidence-item";
import {
  buildStoryRelationCandidateVerificationProof,
  buildStoryRelationExecutionProof,
  canonicalStoryRelationProofSha256,
  storyRelationCandidateFeatureDigest,
  storyRelationExecutionRequestId,
  type StoryRelationProofSelectionContext,
} from "./story-relation-verification-proof";
import type { StoryRelationCandidate } from "./story-relation-candidates";
import { verifiedStoryRelationPairKey } from "./story-cluster-membership";
import { readerSummaryScopeKey, type ReaderSummaryScope } from
  "../value-objects/reader-summary-scope";
import {
  createStoryRelationProofAuthority,
  authorizeStoryRelationCandidateProofForPromotion,
  issueStoryRelationExecutionProof,
  type StoryRelationProofAuthority,
} from "./story-relation-proof-authority";

export const storyRelationTestProofAuthority =
  createStoryRelationProofAuthority();

export const attestedStoryRelationBatchProofFixture = (params: {
  readonly tenantId: unknown;
  readonly workspaceId: unknown;
  readonly scope: ReaderSummaryScope;
  readonly requestedAt: Date;
  readonly verificationLane: "semantic_primary" | "guarded_recall_primary";
  readonly selection: StoryRelationProofSelectionContext;
  readonly candidates: readonly StoryRelationCandidate[];
  readonly decisions: readonly unknown[];
  readonly proofAuthority?: StoryRelationProofAuthority;
}) => {
  const requestId = storyRelationExecutionRequestId({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    scopeKey: readerSummaryScopeKey(params.scope),
    requestedAt: params.requestedAt,
    verificationLane: params.verificationLane,
    selection: params.selection,
    candidates: params.candidates,
  });
  const selectedOutputSha256 = canonicalStoryRelationProofSha256({
    decisions: params.decisions,
  });
  const executionAttestation = {
    schemaVersion: 1 as const,
    requestId,
    purpose: "social_monitor.reader_summary.verify_story_relations.v2",
    canonicalRequestSha256: canonicalStoryRelationProofSha256({
      requestId, selection: params.selection,
    }),
    provider: "codex" as const,
    model: "gpt-5.6-sol",
    reasoningEffort: "high",
    runtimeEngine: "subscription-runtime-cli" as const,
    runtimePackageVersion: "0.1.0-test.1",
    launcherSha256: canonicalStoryRelationProofSha256({
      launcher: "story-relation-test-fixture",
    }),
    selectedOutputKind: "structured_output" as const,
    selectedOutputSha256,
  };
  return issueStoryRelationExecutionProof(
    (params.proofAuthority ?? storyRelationTestProofAuthority)
      .executionProofIssuer,
    buildStoryRelationExecutionProof({
    verificationLane: params.verificationLane,
    promptVersion: "reader_summary.story_relation.agent_runtime.v2",
    selection: params.selection,
    candidates: params.candidates,
    decisions: params.decisions,
    normalizedOutputSha256:
      canonicalStoryRelationProofSha256(params.decisions),
    executionAttestation,
    executionAttestationSha256:
      canonicalStoryRelationProofSha256(executionAttestation),
      selectedOutputSha256,
    }),
  );
};

export const attestedStoryRelationFixture = (params: {
  readonly leftFeedItemId: string;
  readonly rightFeedItemId: string;
  readonly confidence?: number;
  readonly verificationLane?: "semantic_primary" | "guarded_recall_primary";
  readonly rankingPolicyVersion?: string;
  readonly candidatePolicyVersion?: string;
  readonly sourceWindow?: SummarySourceWindow;
  readonly proofAuthority?: StoryRelationProofAuthority;
}): ApprovedSameStoryRelation => {
  const verificationLane = params.verificationLane ?? "semantic_primary";
  const rankingPolicyVersion = params.rankingPolicyVersion ?? "story_ranking_v10";
  const confidence = params.confidence ?? 0.95;
  const canonicalPairId = verifiedStoryRelationPairKey(params.leftFeedItemId,
    params.rightFeedItemId);
  const candidate = candidateFixture(params.leftFeedItemId,
    params.rightFeedItemId);
  const featureDigest = storyRelationCandidateFeatureDigest(candidate);
  const decisions = [{
    leftFeedItemId: params.leftFeedItemId,
    rightFeedItemId: params.rightFeedItemId,
    sameStory: true,
    confidenceScore: confidence,
  }];
  const selectedOutputSha256 = canonicalStoryRelationProofSha256({ decisions });
  const sourceWindow = params.sourceWindow ?? {
    windowId: `story-relation-fixture:${canonicalPairId}`,
    startedAt: new Date("2026-08-20T00:00:00.000Z"),
    endedAt: new Date("2026-08-21T00:00:00.000Z"),
    selectedFeedItemIds: [params.leftFeedItemId, params.rightFeedItemId],
    storyClusterIds: [candidate.leftClusterId, candidate.rightClusterId],
  };
  const proofAuthority = params.proofAuthority ?? storyRelationTestProofAuthority;
  const selection = { rankingPolicyVersion, sourceWindow };
  const executionAttestation = {
    schemaVersion: 1 as const,
    requestId: storyRelationExecutionRequestId({
      tenantId: "story-relation-fixture-tenant",
      workspaceId: "story-relation-fixture-workspace",
      scopeKey: "story-relation-fixture-scope",
      requestedAt: sourceWindow.endedAt,
      verificationLane,
      selection,
      candidates: [candidate],
    }),
    purpose: "social_monitor.reader_summary.verify_story_relations.v2",
    canonicalRequestSha256: canonicalStoryRelationProofSha256({
      canonicalPairId, rankingPolicyVersion, verificationLane,
    }),
    provider: "codex" as const,
    model: "gpt-5.6-sol",
    reasoningEffort: "high",
    runtimeEngine: "subscription-runtime-cli" as const,
    runtimePackageVersion: "0.1.0-test.1",
    launcherSha256: canonicalStoryRelationProofSha256({
      launcher: "story-relation-test-fixture",
    }),
    selectedOutputKind: "structured_output" as const,
    selectedOutputSha256,
  };
  const executionProof = issueStoryRelationExecutionProof(
    proofAuthority.executionProofIssuer,
    buildStoryRelationExecutionProof({
    verificationLane,
    promptVersion: "reader_summary.story_relation.agent_runtime.v2",
    selection,
    candidates: [candidate],
    decisions,
    normalizedOutputSha256: canonicalStoryRelationProofSha256(decisions),
    executionAttestation,
    executionAttestationSha256:
      canonicalStoryRelationProofSha256(executionAttestation),
      selectedOutputSha256,
    }),
  );
  const verificationProof = buildStoryRelationCandidateVerificationProof({
    proofIssuer: proofAuthority.candidateProofIssuer,
    executionProof,
    canonicalPairId,
    leftFeedItemId: params.leftFeedItemId,
    rightFeedItemId: params.rightFeedItemId,
    featureDigest,
    confidenceScore: confidence,
  });
  authorizeStoryRelationCandidateProofForPromotion(
    proofAuthority.proofVerifier,
    verificationProof,
  );
  return {
    canonicalPairId,
    leftFeedItemId: params.leftFeedItemId,
    rightFeedItemId: params.rightFeedItemId,
    confidence,
    verificationLane,
    candidatePolicyVersion: params.candidatePolicyVersion ??
      (verificationLane === "guarded_recall_primary"
        ? "reader_summary.story_relation.guarded_recall.v1"
        : "reader_summary.story_relation.candidate.v1"),
    rankingPolicyVersion,
    featureDigest,
    executionAttestationSha256: executionProof.executionAttestationSha256,
    normalizedOutputSha256: executionProof.normalizedOutputSha256,
    selectedOutputSha256: executionProof.selectedOutputSha256,
    verificationProof,
  };
};

const candidateFixture = (
  leftFeedItemId: string,
  rightFeedItemId: string,
): StoryRelationCandidate => ({
  leftFeedItemId,
  rightFeedItemId,
  leftClusterId: `cluster:${leftFeedItemId}`,
  rightClusterId: `cluster:${rightFeedItemId}`,
  sharedTopicTokens: ["fixture-event"],
  sharedAnchorTokens: ["fixture-anchor"],
  sharedEventTokens: ["fixture-event"],
  sharedSpecificProductTokens: ["fixture-anchor"],
  topicSimilarity: 1,
});
