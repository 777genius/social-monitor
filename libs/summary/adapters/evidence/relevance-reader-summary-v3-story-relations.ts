import {
  StoryClusteringService,
  type ReaderPostPromotionV3Candidate,
  type StoryCluster,
  type SummaryEvidenceItem,
} from "../../domain";
import { STORY_RANKING_POLICY_V1 } from
  "../../domain/policies/story-ranking-policy";
import type { ReaderSummaryScopeIdentity } from
  "../../domain/value-objects/reader-summary-scope";

const maxWorkspaceStoryRelationCandidates = 5_000;
const maxWorkspaceStoryPairComparisons = 4_096;

export const semanticAdmission = (candidate: ReaderPostPromotionV3Candidate): boolean =>
  (candidate.answers.usefulness.choice === "useful" ||
    candidate.answers.usefulness.choice === "important") &&
  (candidate.answers.relevance.choice === "relevant" ||
    candidate.answers.relevance.choice === "central") &&
  !candidate.appendixOnly && candidate.scopeValid && candidate.sourceIdentityValid &&
  candidate.freshnessValid && candidate.safetyValid && !candidate.blocked;

type StoryRelationParams = {
  readonly candidates: readonly ReaderPostPromotionV3Candidate[];
  readonly evidence: readonly SummaryEvidenceItem[];
  readonly cutoffAt: string;
  readonly identity: ReaderSummaryScopeIdentity;
  readonly workspaceManifest: boolean;
};

export const clusterPromotionStoryRelations = (
  params: StoryRelationParams,
): { readonly kind: "ready"; readonly clusters: readonly StoryCluster[] } |
  { readonly kind: "budget_exhausted" } => {
  // The generic story matcher compares groups pairwise. Only candidates
  // eligible for V3 promotion can affect the global Top or Additional story
  // relation; exact source, explicit story and canonical identities still
  // join every assessed candidate during duplicate story normalization.
  const relationCandidates = params.workspaceManifest
    ? params.candidates.filter(semanticAdmission) : params.candidates;
  if (params.workspaceManifest &&
      relationCandidates.length > maxWorkspaceStoryRelationCandidates) {
    return { kind: "budget_exhausted" };
  }
  const relationIds = new Set(relationCandidates.map((candidate) => candidate.candidateId));
  const relationEvidence = params.evidence.filter((item) =>
    relationIds.has(item.feedItemId));
  const clustering = new StoryClusteringService(
    { now: () => new Date(params.cutoffAt) },
    { ...STORY_RANKING_POLICY_V1,
      maxClusters: Math.max(1, relationEvidence.length) },
  );
  const clusteringParams = {
    identity: params.identity,
    items: [...relationEvidence].sort((left, right) =>
      compareUtf8Bytes(left.feedItemId, right.feedItemId)),
    limit: Math.max(1, relationEvidence.length),
    now: new Date(params.cutoffAt),
  };
  const clustered = params.workspaceManifest
    ? clustering.clusterWithinComparisonBudget(clusteringParams,
      maxWorkspaceStoryPairComparisons)
    : { kind: "ready" as const, selection: clustering.cluster(clusteringParams) };
  return clustered.kind === "budget_exhausted" ? clustered :
    { kind: "ready", clusters: clustered.selection.clusters };
};

const compareUtf8Bytes = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
