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
  readonly deterministicStoryIds: ReadonlyMap<string, string>;
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
  const relationIds = new Set(relationCandidates.map((candidate) => candidate.candidateId));
  const relationEvidence = params.evidence.filter((item) =>
    relationIds.has(item.feedItemId));
  // Promotion still receives every frozen candidate and assessment. Only the
  // story matcher needs one representative per already resolved exact identity.
  // Its returned relations are joined back to all alternatives by the same
  // source, explicit story and deterministic story identities in promotion.
  const comparisonEvidence = params.workspaceManifest
    ? compactExactStoryIdentities(relationCandidates, relationEvidence,
      params.deterministicStoryIds)
    : relationEvidence;
  if (params.workspaceManifest &&
      comparisonEvidence.length > maxWorkspaceStoryRelationCandidates) {
    return { kind: "budget_exhausted" };
  }
  const clustering = new StoryClusteringService(
    { now: () => new Date(params.cutoffAt) },
    { ...STORY_RANKING_POLICY_V1,
      maxClusters: Math.max(1, comparisonEvidence.length) },
  );
  const clusteringParams = {
    identity: params.identity,
    items: [...comparisonEvidence].sort((left, right) =>
      compareUtf8Bytes(left.feedItemId, right.feedItemId)),
    limit: Math.max(1, comparisonEvidence.length),
    now: new Date(params.cutoffAt),
  };
  const clustered = params.workspaceManifest
    ? clustering.clusterWithinComparisonBudget(clusteringParams,
      maxWorkspaceStoryPairComparisons)
    : { kind: "ready" as const, selection: clustering.cluster(clusteringParams) };
  return clustered.kind === "budget_exhausted" ? clustered :
    { kind: "ready", clusters: clustered.selection.clusters };
};

const compactExactStoryIdentities = (
  candidates: readonly ReaderPostPromotionV3Candidate[],
  evidence: readonly SummaryEvidenceItem[],
  deterministicStoryIds: ReadonlyMap<string, string>,
): readonly SummaryEvidenceItem[] => {
  const byId = new Map(evidence.map((item) => [item.feedItemId, item] as const));
  const parent = new Map(evidence.map((item) =>
    [item.feedItemId, item.feedItemId] as const));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    while (id !== root) {
      const next = parent.get(id)!;
      parent.set(id, root);
      id = next;
    }
    return root;
  };
  const firstByIdentity = new Map<string, string>();
  for (const candidate of candidates) {
    const item = byId.get(candidate.candidateId);
    if (item === undefined) continue;
    const identities = [
      `source:\u0000${candidate.sourceItemId}`,
      `story:\u0000${candidate.storyId}`,
      `deterministic:\u0000${deterministicStoryIds.get(candidate.candidateId)!}`,
    ];
    for (const identity of identities) {
      const first = firstByIdentity.get(identity);
      if (first === undefined) firstByIdentity.set(identity, item.feedItemId);
      else parent.set(find(item.feedItemId), find(first));
    }
  }
  const representativeByRoot = new Map<string, SummaryEvidenceItem>();
  for (const item of evidence) {
    const root = find(item.feedItemId);
    const previous = representativeByRoot.get(root);
    if (previous === undefined ||
        compareUtf8Bytes(item.feedItemId, previous.feedItemId) < 0) {
      representativeByRoot.set(root, item);
    }
  }
  return [...representativeByRoot.values()];
};

const compareUtf8Bytes = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
