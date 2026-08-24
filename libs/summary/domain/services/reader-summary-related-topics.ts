import { hasFirstPartyOfficialEvidence } from "../policies/reader-summary-source-authority-policy";
import type {
  RelatedTopicRelation,
  StoryCluster,
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
} from "../value-objects/summary-evidence-item";
import type { StoryRelationCandidate } from "./story-relation-candidates";
import { verifiedStoryRelationPairKey } from "./story-cluster-membership";
import { strictStoryRelationTitleEvidence } from "./story-relation-title-evidence";
import { ReaderSummaryRelatedTopicRelation } from "../value-objects/reader-summary-related-topic-relation";

export type RelatedTopicCandidate = StoryRelationCandidate & {
  readonly subjectFeedItemId: string;
  readonly officialAnchorFeedItemId: string;
  readonly subjectStoryClusterId: string;
  readonly targetStoryClusterId: string;
};

export type RelatedTopicVerdict = {
  readonly leftFeedItemId: string;
  readonly rightFeedItemId: string;
  readonly relation: "same_story" | "related_topic" | "unrelated";
  readonly confidenceScore: number;
  readonly rationale?: string;
};

export const RELATED_TOPIC_APPROVAL_CONFIDENCE_MIN = 0.92;
export const RELATED_TOPIC_MAX_CANDIDATES = 8;
const relatedTopicMaxCandidatesPerClusterPair = 1;

export const buildRelatedTopicCandidates = (params: {
  readonly selection: SummaryEvidenceSelection;
}): readonly RelatedTopicCandidate[] => {
  const evidenceById = new Map(
    params.selection.selectedEvidence.map((item) => [item.feedItemId, item]),
  );
  const evidenceByCluster = clusterEvidence(
    params.selection.clusters,
    evidenceById,
  );
  const relationCandidates = providerNeutralRelatedTopicCandidates({
    clusters: params.selection.clusters,
    evidenceByCluster,
  });
  const candidatesByDirection = new Map<string, RelatedTopicCandidate[]>();

  for (const candidate of relationCandidates) {
    const leftEvidence = evidenceByCluster.get(candidate.leftClusterId) ?? [];
    const rightEvidence = evidenceByCluster.get(candidate.rightClusterId) ?? [];
    const leftOfficial = hasFirstPartyOfficialEvidence(leftEvidence);
    const rightOfficial = hasFirstPartyOfficialEvidence(rightEvidence);
    if (leftOfficial === rightOfficial) {
      continue;
    }
    const subjectStoryClusterId = leftOfficial
      ? candidate.rightClusterId
      : candidate.leftClusterId;
    const targetStoryClusterId = leftOfficial
      ? candidate.leftClusterId
      : candidate.rightClusterId;
    const subjectFeedItemId = leftOfficial
      ? candidate.rightFeedItemId
      : candidate.leftFeedItemId;
    const officialAnchorFeedItemId = leftOfficial
      ? candidate.leftFeedItemId
      : candidate.rightFeedItemId;
    const officialAnchor = evidenceById.get(officialAnchorFeedItemId);
    if (
      officialAnchor === undefined ||
      !hasFirstPartyOfficialEvidence([officialAnchor])
    ) {
      continue;
    }
    const directed: RelatedTopicCandidate = {
      ...candidate,
      subjectFeedItemId,
      officialAnchorFeedItemId,
      subjectStoryClusterId,
      targetStoryClusterId,
    };
    const key = `${subjectStoryClusterId}\u0000${targetStoryClusterId}`;
    candidatesByDirection.set(key, [
      ...(candidatesByDirection.get(key) ?? []),
      directed,
    ]);
  }

  return [...candidatesByDirection.values()]
    .map((candidates) =>
      [...candidates].sort((left, right) =>
        evidenceIdentity(evidenceById.get(left.subjectFeedItemId)).localeCompare(
          evidenceIdentity(evidenceById.get(right.subjectFeedItemId)),
        ) || candidateIdentity(left).localeCompare(candidateIdentity(right)),
      )[0],
    )
    .filter((candidate): candidate is RelatedTopicCandidate =>
      candidate !== undefined,
    )
    .sort((left, right) => candidateIdentity(left).localeCompare(candidateIdentity(right)))
    .slice(0, RELATED_TOPIC_MAX_CANDIDATES);
};

export const reconcileRelatedTopicVerdicts = (params: {
  readonly candidates: readonly RelatedTopicCandidate[];
  readonly decisions: readonly unknown[];
  readonly evidence: readonly SummaryEvidenceItem[];
  readonly clusters: readonly StoryCluster[];
}): readonly RelatedTopicRelation[] => {
  const membership = uniqueClusterMembership(params.clusters);
  if (membership === undefined) return [];
  const clusterById = new Map(
    params.clusters.map((cluster) => [cluster.id, cluster] as const),
  );
  const candidateByPair = new Map(
    params.candidates.map((candidate) => [candidatePair(candidate), candidate]),
  );
  const decisionsByPair = new Map<string, RelatedTopicVerdict[]>();
  for (const raw of params.decisions) {
    const decision = relatedTopicVerdict(raw);
    if (decision === undefined) return [];
    const pair = verifiedStoryRelationPairKey(
      decision.leftFeedItemId,
      decision.rightFeedItemId,
    );
    if (!candidateByPair.has(pair)) return [];
    decisionsByPair.set(pair, [...(decisionsByPair.get(pair) ?? []), decision]);
  }
  if (
    params.candidates.some(
      (candidate) => (decisionsByPair.get(candidatePair(candidate))?.length ?? 0) !== 1,
    )
  ) {
    return [];
  }

  const evidenceById = new Map(
    params.evidence.map((item) => [item.feedItemId, item]),
  );
  const relations = params.candidates.flatMap((candidate) => {
    const decision = decisionsByPair.get(candidatePair(candidate))?.[0];
    const subject = evidenceById.get(candidate.subjectFeedItemId);
    const anchor = evidenceById.get(candidate.officialAnchorFeedItemId);
    if (
      decision?.relation !== "related_topic" ||
      decision.confidenceScore < RELATED_TOPIC_APPROVAL_CONFIDENCE_MIN ||
      subject === undefined ||
      anchor === undefined ||
      candidate.subjectStoryClusterId === candidate.targetStoryClusterId
    ) {
      return [];
    }
    const subjectCluster = membership.get(candidate.subjectFeedItemId);
    const anchorCluster = membership.get(candidate.officialAnchorFeedItemId);
    if (
      subjectCluster !== candidate.subjectStoryClusterId ||
      anchorCluster !== candidate.targetStoryClusterId ||
      hasFirstPartyOfficialEvidence([subject]) ||
      !hasFirstPartyOfficialEvidence([anchor]) ||
      !clusterById.get(candidate.subjectStoryClusterId)?.providerKeys.some(
        (providerKey) =>
          normalizedProvider(providerKey) ===
          normalizedProvider(subject.providerKey),
      ) ||
      !clusterById.get(candidate.targetStoryClusterId)?.providerKeys.some(
        (providerKey) =>
          normalizedProvider(providerKey) ===
          normalizedProvider(anchor.providerKey),
      )
    ) return [];
    return [ReaderSummaryRelatedTopicRelation.create({
      subjectStoryClusterId: candidate.subjectStoryClusterId,
      targetStoryClusterId: candidate.targetStoryClusterId,
      subjectFeedItemId: candidate.subjectFeedItemId,
      subjectProviderKey: subject.providerKey,
      subjectSourceItemId: subject.sourceItemId,
      subjectCanonicalUrl: subject.canonicalUrl,
      subjectProviderMetrics: subject.providerMetricLabels ?? [],
      officialAnchorFeedItemId: candidate.officialAnchorFeedItemId,
      officialAnchorProviderKey: anchor.providerKey,
      officialAnchorSourceItemId: anchor.sourceItemId,
      officialAnchorContentQuality: anchor.contentQuality!,
    }).toSnapshot()];
  });
  return new Set(relations.map((relation) => relation.relationId)).size === relations.length
    ? relations
    : [];
};

export const isValidRelatedTopicVerdictBatch = (params: {
  readonly candidates: readonly RelatedTopicCandidate[];
  readonly decisions: readonly unknown[];
}): boolean => {
  const expectedPairs = new Set(params.candidates.map(candidatePair));
  const returnedPairs = new Set<string>();
  for (const raw of params.decisions) {
    const decision = relatedTopicVerdict(raw);
    if (decision === undefined) return false;
    const pair = verifiedStoryRelationPairKey(
      decision.leftFeedItemId,
      decision.rightFeedItemId,
    );
    if (!expectedPairs.has(pair) || returnedPairs.has(pair)) return false;
    returnedPairs.add(pair);
  }
  return returnedPairs.size === expectedPairs.size;
};

const relatedTopicVerdict = (raw: unknown): RelatedTopicVerdict | undefined => {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  const allowed = new Set([
    "leftFeedItemId", "rightFeedItemId", "relation", "confidenceScore", "rationale",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return undefined;
  if (
    typeof value.leftFeedItemId !== "string" || value.leftFeedItemId.trim() === "" ||
    typeof value.rightFeedItemId !== "string" || value.rightFeedItemId.trim() === "" ||
    (value.relation !== "same_story" && value.relation !== "related_topic" && value.relation !== "unrelated") ||
    typeof value.confidenceScore !== "number" || !Number.isFinite(value.confidenceScore) ||
    value.confidenceScore < 0 || value.confidenceScore > 1 ||
    (value.rationale !== undefined && typeof value.rationale !== "string")
  ) return undefined;
  return {
    leftFeedItemId: value.leftFeedItemId.trim(),
    rightFeedItemId: value.rightFeedItemId.trim(),
    relation: value.relation,
    confidenceScore: value.confidenceScore,
    ...(typeof value.rationale === "string" ? { rationale: value.rationale.trim() } : {}),
  };
};

const clusterEvidence = (
  clusters: readonly StoryCluster[],
  evidenceById: ReadonlyMap<string, SummaryEvidenceItem>,
): ReadonlyMap<string, readonly SummaryEvidenceItem[]> =>
  new Map(clusters.map((cluster) => [
    cluster.id,
    [cluster.representativeFeedItemId, ...cluster.duplicateFeedItemIds]
      .flatMap((id) => evidenceById.get(id) ?? []),
  ]));

const providerNeutralRelatedTopicCandidates = (params: {
  readonly clusters: readonly StoryCluster[];
  readonly evidenceByCluster: ReadonlyMap<string, readonly SummaryEvidenceItem[]>;
}): readonly RelatedTopicCandidate[] => {
  const candidates: RelatedTopicCandidate[] = [];
  const counts = new Map<string, number>();
  const clusters = [...params.clusters].sort((left, right) => left.id.localeCompare(right.id));
  for (let leftIndex = 0; leftIndex < clusters.length; leftIndex += 1) {
    const leftCluster = clusters[leftIndex]!;
    const leftEvidence = [...(params.evidenceByCluster.get(leftCluster.id) ?? [])]
      .sort((left, right) => evidenceIdentity(left).localeCompare(evidenceIdentity(right)));
    for (let rightIndex = leftIndex + 1; rightIndex < clusters.length; rightIndex += 1) {
      const rightCluster = clusters[rightIndex]!;
      const rightEvidence = [...(params.evidenceByCluster.get(rightCluster.id) ?? [])]
        .sort((left, right) => evidenceIdentity(left).localeCompare(evidenceIdentity(right)));
      if (
        hasFirstPartyOfficialEvidence(leftEvidence) ===
        hasFirstPartyOfficialEvidence(rightEvidence)
      ) continue;
      const leftIsOfficial = hasFirstPartyOfficialEvidence(leftEvidence);
      const officialCluster = leftIsOfficial ? leftCluster : rightCluster;
      const subjectCluster = leftIsOfficial ? rightCluster : leftCluster;
      const officialEvidence = (leftIsOfficial ? leftEvidence : rightEvidence)
        .filter((item) => hasFirstPartyOfficialEvidence([item]));
      const subjectEvidence = leftIsOfficial ? rightEvidence : leftEvidence;
      const pairKey = [leftCluster.id, rightCluster.id].sort().join("\u0000");
      for (const subject of subjectEvidence) {
        for (const anchor of officialEvidence) {
          const left = leftIsOfficial ? anchor : subject;
          const right = leftIsOfficial ? subject : anchor;
          if (left.providerKey.trim().toLowerCase() === right.providerKey.trim().toLowerCase()) continue;
          const titleEvidence = strictStoryRelationTitleEvidence(left.title, right.title);
          if (titleEvidence === undefined) continue;
          if ((counts.get(pairKey) ?? 0) >= relatedTopicMaxCandidatesPerClusterPair) continue;
          const subjectFirst =
            subject.feedItemId.localeCompare(anchor.feedItemId) <= 0;
          candidates.push({
            leftFeedItemId: subjectFirst
              ? subject.feedItemId
              : anchor.feedItemId,
            rightFeedItemId: subjectFirst
              ? anchor.feedItemId
              : subject.feedItemId,
            leftClusterId: subjectFirst
              ? subjectCluster.id
              : officialCluster.id,
            rightClusterId: subjectFirst
              ? officialCluster.id
              : subjectCluster.id,
            sharedTopicTokens: titleEvidence.sharedTitleTokens,
            sharedAnchorTokens: titleEvidence.sharedEntityTokens,
            sharedEventTokens: titleEvidence.sharedEventTokens,
            sharedSpecificProductTokens: titleEvidence.sharedEntityTokens,
            topicSimilarity: 0,
            subjectFeedItemId: subject.feedItemId,
            officialAnchorFeedItemId: anchor.feedItemId,
            subjectStoryClusterId: subjectCluster.id,
            targetStoryClusterId: officialCluster.id,
          });
          counts.set(pairKey, (counts.get(pairKey) ?? 0) + 1);
        }
      }
    }
  }
  return candidates.sort((left, right) => candidatePair(left).localeCompare(candidatePair(right)))
    .slice(0, RELATED_TOPIC_MAX_CANDIDATES);
};

const evidenceIdentity = (item: SummaryEvidenceItem | undefined): string =>
  item === undefined
    ? ""
    : `${item.providerKey.trim().toLowerCase()}\u0000${item.sourceItemId.trim()}`;

const normalizedProvider = (value: string): string =>
  value.trim().toLocaleLowerCase("en-US");


const uniqueClusterMembership = (
  clusters: readonly StoryCluster[],
): ReadonlyMap<string, string> | undefined => {
  const membership = new Map<string, string>();
  for (const cluster of clusters) {
    for (const feedItemId of [
      cluster.representativeFeedItemId,
      ...cluster.duplicateFeedItemIds,
    ]) {
      if (membership.has(feedItemId)) return undefined;
      membership.set(feedItemId, cluster.id);
    }
  }
  return membership;
};

const candidatePair = (candidate: RelatedTopicCandidate): string =>
  verifiedStoryRelationPairKey(candidate.leftFeedItemId, candidate.rightFeedItemId);

const candidateIdentity = (candidate: RelatedTopicCandidate): string =>
  `${candidate.subjectStoryClusterId}\u0000${candidate.targetStoryClusterId}\u0000${candidatePair(candidate)}`;
