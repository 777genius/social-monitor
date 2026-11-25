import {
  StoryClusteringService,
  type ReaderPostPromotionV3Candidate,
  type ReaderSummaryPreparationCandidate,
  type StoryCluster,
  type SummaryEvidenceItem,
  type SummaryEvidenceSelection,
} from "../../domain";
import { STORY_RANKING_POLICY_V1 } from
  "../../domain/policies/story-ranking-policy";
import { storyKey } from "../../domain/services/story-key-normalizer";
import type { ReaderSummaryScopeIdentity } from
  "../../domain/value-objects/reader-summary-scope";

const maxWorkspaceStoryRelationCandidates = 5_000;
// Bounds actual predicate-member work; 4,096 different-key stories fit
// (8,386,560), while 4,097 still fail closed (8,390,656). A weekly universe
// needs thousands of distinct stories; no candidates are dropped to fit.
const maxWorkspaceStoryPairComparisons = 8_388_608;

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
  readonly verifiedStoryRelationPairs?: ReadonlySet<string>;
};

export const clusterPromotionStoryRelations = (
  params: StoryRelationParams,
): { readonly kind: "ready"; readonly clusters: readonly StoryCluster[];
  readonly selection: SummaryEvidenceSelection } |
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
    verifiedStoryRelationPairs: params.verifiedStoryRelationPairs,
  };
  const clustered = params.workspaceManifest
    ? clustering.clusterWithinComparisonBudget(clusteringParams,
      maxWorkspaceStoryPairComparisons)
    : { kind: "ready" as const, selection: clustering.cluster(clusteringParams) };
  return clustered.kind === "budget_exhausted" ? clustered :
    { kind: "ready", clusters: clustered.selection.clusters,
      selection: clustered.selection };
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

/**
 * Joins candidates sharing a source item, an explicit story, a deterministic
 * story key or a story-relation cluster into one story id.
 */
export const normalizeDuplicateStoryIds = (
  candidates: readonly ReaderPostPromotionV3Candidate[],
  explicitStoryIds: ReadonlyMap<string, string | undefined>,
  deterministicStoryIds: ReadonlyMap<string, string>,
  storyClusters: readonly StoryCluster[],
): ReaderPostPromotionV3Candidate[] => {
  const parent = new Map(candidates.map((candidate) =>
    [candidate.candidateId, candidate.candidateId] as const));
  const find = (id: string): string => {
    const next = parent.get(id)!;
    if (next === id) return id;
    const root = find(next);
    parent.set(id, root);
    return root;
  };
  const union = (left: string, right: string): void => {
    const roots = [find(left), find(right)].sort(compareUtf8Bytes);
    if (roots[0] !== roots[1]) parent.set(roots[1]!, roots[0]!);
  };
  const bySource = new Map<string, string>();
  const byStory = new Map<string, string>();
  const byDeterministicStory = new Map<string, string>();
  for (const candidate of candidates) {
    for (const [key, map] of [[candidate.sourceItemId, bySource],
      [candidate.storyId, byStory],
      [deterministicStoryIds.get(candidate.candidateId)!, byDeterministicStory]] as const) {
      const previous = map.get(key);
      if (previous === undefined) map.set(key, candidate.candidateId);
      else union(previous, candidate.candidateId);
    }
  }
  for (const cluster of storyClusters) {
    const memberIds = [cluster.representativeFeedItemId,
      ...cluster.duplicateFeedItemIds];
    const first = memberIds[0];
    if (first === undefined || !parent.has(first)) continue;
    for (const memberId of memberIds.slice(1)) {
      if (parent.has(memberId)) union(first, memberId);
    }
  }
  const groups = new Map<string, ReaderPostPromotionV3Candidate[]>();
  for (const candidate of candidates) {
    const root = find(candidate.candidateId);
    const group = groups.get(root);
    if (group === undefined) groups.set(root, [candidate]);
    else group.push(candidate);
  }
  const storyByCandidate = new Map<string, string>();
  for (const group of groups.values()) {
    const explicit = group.flatMap((candidate) => {
      const value = explicitStoryIds.get(candidate.candidateId);
      return value === undefined ? [] : [value];
    }).sort(compareUtf8Bytes);
    const storyId = explicit[0] ?? group.map((candidate) => candidate.storyId)
      .sort(compareUtf8Bytes)[0]!;
    for (const candidate of group) storyByCandidate.set(candidate.candidateId, storyId);
  }
  return candidates.map((candidate) => ({ ...candidate,
    storyId: storyByCandidate.get(candidate.candidateId)! }));
};

/** Canonical story key of one frozen candidate (title, body and URL tokens). */
export const deterministicPromotionStoryId = (
  candidate: ReaderSummaryPreparationCandidate,
  title: string,
  body: string,
): string => `story:${storyKey({
  feedItemId: candidate.candidateId, sourceItemId: candidate.sourceItemId,
  sourceBindingId: candidate.sourceBindingId, interestId: "frozen-v3",
  providerKey: candidate.providerKey, canonicalUrl: candidate.canonicalIdentity,
  title, bodyPreview: body, publishedAt: new Date(candidate.publishedAt),
  observedAt: new Date(candidate.observedAt), score: 0, whyImportant: [],
}, STORY_RANKING_POLICY_V1)}`;
