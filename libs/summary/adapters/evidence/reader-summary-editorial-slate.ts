import {
  rankReaderPromotionV2,
  type AdmittedReaderPromotionV2,
  type ReaderPromotionV2Provider,
} from "@social-monitor/feed/domain";

import {
  READER_SUMMARY_EDITORIAL_SLATE_VERSION,
  readerPostProviderFamily,
  type ReaderSummaryEditorialPlacement,
  type ReaderSummaryEditorialSlate,
  type ReaderSummaryEditorialSlateEntry,
  type StoryCluster,
  type SummaryEvidenceItem,
  type SummaryEvidenceSelection,
} from "../../domain";
import { readerPostPromotionTopProviderCap } from
  "../../domain/policies/top-read-provider-diversity-policy";
import {
  isEligibleReaderSummarySameStorySupport,
  readerSummaryPromotionV2Candidate,
} from "./reader-summary-editorial-candidate";

const topLimit = 8;
const additionalLimit = 8;

export const composeReaderSummaryEditorialSlate = (params: {
  readonly selection: SummaryEvidenceSelection;
  readonly candidates?: readonly SummaryEvidenceItem[];
}): ReaderSummaryEditorialSlate => {
  const candidates = (params.candidates ?? params.selection.selectedEvidence)
    .flatMap((item) => {
      const candidate = readerSummaryPromotionV2Candidate(item, params.selection);
      return candidate === undefined ? [] : [candidate];
    });
  const itemById = new Map(
    (params.candidates ?? params.selection.selectedEvidence).map((item) =>
      [item.feedItemId, item] as const),
  );
  if (itemById.size !== (params.candidates ??
      params.selection.selectedEvidence).length) {
    throw new Error("Reader summary promotion candidate ids must be unique");
  }
  const clusterIdByEvidenceId = clusterMembership(params.selection.clusters);
  const semanticStoryIdByEvidenceId = semanticStoryMembership(params.selection);
  const ranking = rankReaderPromotionV2(candidates);
  const { representatives, duplicateExclusions } = semanticRepresentatives({
    ranked: ranking.ranked,
    semanticStoryIdByEvidenceId,
  });
  const topQualifiedRepresentatives = representatives.filter(
    (candidate) => candidate.topQualified,
  );
  const activeProviderCount = new Set(
    topQualifiedRepresentatives.map((candidate) => candidate.provider),
  ).size;
  const providerCap = readerPostPromotionTopProviderCap(activeProviderCount);
  const top: AdmittedReaderPromotionV2[] = [];
  const topIds = new Set<string>();
  const topProviderCounts = new Map<ReaderPromotionV2Provider, number>();

  for (const candidate of topQualifiedRepresentatives) {
    if (top.length >= topLimit) break;
    if ((topProviderCounts.get(candidate.provider) ?? 0) > 0) continue;
    top.push(candidate);
    topIds.add(candidate.candidateId);
    topProviderCounts.set(candidate.provider, 1);
  }
  for (const candidate of topQualifiedRepresentatives) {
    if (top.length >= topLimit) break;
    if (topIds.has(candidate.candidateId)) continue;
    const providerCount = topProviderCounts.get(candidate.provider) ?? 0;
    if (providerCount >= providerCap) {
      continue;
    }
    top.push(candidate);
    topIds.add(candidate.candidateId);
    topProviderCounts.set(candidate.provider, providerCount + 1);
  }
  const additional = representatives
    .filter((candidate) => !topIds.has(candidate.candidateId))
    .slice(0, additionalLimit);
  const topEntries = top.map((candidate, index) => slateEntry({
    candidate,
    placement: "top",
    slot: index + 1,
    storyClusterId: storyClusterId(candidate, clusterIdByEvidenceId),
    reasonCodes: [
      "reader_promotion_v2_admitted",
      "semantic_story_representative",
      "top_slot_assigned",
      ...(activeProviderCount > 1 ? ["provider_cap_enforced"] : []),
    ],
  }));
  const additionalEntries = additional.map((candidate, index) => slateEntry({
    candidate,
    placement: "additional",
    slot: index + 1,
    storyClusterId: storyClusterId(candidate, clusterIdByEvidenceId),
    reasonCodes: [
      "reader_promotion_v2_admitted",
      "semantic_story_representative",
      !candidate.topQualified
        ? "top_floor_not_met"
        : ((topProviderCounts.get(candidate.provider) ?? 0) >= providerCap
            ? "top_provider_cap_overflow"
            : "top_capacity_overflow"),
      "additional_slot_assigned",
    ],
  }));
  const selectedEntries = [...topEntries, ...additionalEntries];
  const selectedIds = new Set(
    selectedEntries.map((entry) => entry.candidateId),
  );
  const capacityExclusions = representatives
    .filter((candidate) => !selectedIds.has(candidate.candidateId))
    .map((candidate) => ({
      candidateId: candidate.candidateId,
      canonicalIdentity: candidate.canonicalIdentity,
      reasonCodes: ["editorial_capacity_exhausted"] as readonly string[],
    }));
  const excluded = [
    ...ranking.rejected.map((candidate) => ({
      candidateId: candidate.candidateId,
      canonicalIdentity: candidate.canonicalIdentity,
      reasonCodes: candidate.reasons,
    })),
    ...duplicateExclusions,
    ...capacityExclusions,
  ]
    .sort((left, right) =>
      left.canonicalIdentity.localeCompare(right.canonicalIdentity) ||
      left.candidateId.localeCompare(right.candidateId),
    )
    .map((item) => Object.freeze({
      ...item,
      reasonCodes: Object.freeze([...item.reasonCodes]),
    }));
  const digestInputs = selectedEntries.map((entry) => entry.digestInput);
  const digestMaterial = JSON.stringify({
    policyVersion: READER_SUMMARY_EDITORIAL_SLATE_VERSION,
    sourceWindow: editorialSourceWindowDigest(params.selection),
    orderedCandidateIds: selectedEntries.map((entry) => entry.candidateId),
    orderedCanonicalIdentities: selectedEntries.map(
      (entry) => entry.canonicalIdentity,
    ),
    digestInputs,
  });

  return Object.freeze({
    policyVersion: READER_SUMMARY_EDITORIAL_SLATE_VERSION,
    top: Object.freeze(topEntries),
    additional: Object.freeze(additionalEntries),
    excluded: Object.freeze(excluded),
    orderedCandidateIds: Object.freeze(
      selectedEntries.map((entry) => entry.candidateId),
    ),
    orderedCanonicalIdentities: Object.freeze(
      selectedEntries.map((entry) => entry.canonicalIdentity),
    ),
    digestInputs: Object.freeze(digestInputs),
    digestMaterial,
  });
};

const editorialSourceWindowDigest = (
  selection: SummaryEvidenceSelection,
) => ({
  windowId: selection.sourceWindow.windowId,
  startedAt: selection.sourceWindow.startedAt.toISOString(),
  endedAt: selection.sourceWindow.endedAt.toISOString(),
  periodStartedAt: (
    selection.sourceWindow.periodStartedAt ?? selection.sourceWindow.startedAt
  ).toISOString(),
  periodEndedAt: (
    selection.sourceWindow.periodEndedAt ?? selection.sourceWindow.endedAt
  ).toISOString(),
  ingestionCutoff: (
    selection.sourceWindow.ingestionCutoff ?? selection.sourceWindow.endedAt
  ).toISOString(),
});

export const materializeReaderSummaryEditorialSlate = (params: {
  readonly selection: SummaryEvidenceSelection;
  readonly slate: ReaderSummaryEditorialSlate;
  readonly supplementalEvidence?: readonly SummaryEvidenceItem[];
}): SummaryEvidenceSelection => {
  const evidenceById = new Map(params.selection.selectedEvidence.map((item) =>
    [item.feedItemId, item] as const));
  const clusterById = new Map(params.selection.clusters.map((cluster) =>
    [cluster.id, cluster] as const));
  const semanticStoryIdByEvidenceId = semanticStoryMembership(params.selection);
  const selectedIds = new Set(params.slate.orderedCandidateIds);
  const orderedEvidence: SummaryEvidenceItem[] = [];
  const clusters: StoryCluster[] = [];
  const seenEvidenceIds = new Set<string>();

  for (const entry of [...params.slate.top, ...params.slate.additional]) {
    const lead = evidenceById.get(entry.candidateId);
    if (lead === undefined) {
      throw new Error(`Editorial slate evidence is missing: ${entry.candidateId}`);
    }
    const original = clusterById.get(entry.storyClusterId);
    const semanticStoryId = semanticStoryIdByEvidenceId.get(entry.candidateId);
    const support = params.selection.selectedEvidence
      .filter((item) =>
        item.feedItemId !== entry.candidateId &&
        !selectedIds.has(item.feedItemId) &&
        semanticStoryId !== undefined &&
        semanticStoryIdByEvidenceId.get(item.feedItemId) === semanticStoryId)
      .filter((item) =>
        isEligibleReaderSummarySameStorySupport(item, params.selection))
      .filter((item) =>
        readerPostProviderFamily(item.providerKey) !==
          readerPostProviderFamily(lead.providerKey),
      )
      .sort((left, right) => left.feedItemId.localeCompare(right.feedItemId));
    const members = [lead, ...support];
    for (const item of members) {
      if (!seenEvidenceIds.has(item.feedItemId)) {
        seenEvidenceIds.add(item.feedItemId);
        orderedEvidence.push(item);
      }
    }
    const observedAt = members.map((item) => item.observedAt.getTime());
    clusters.push({
      id: entry.storyClusterId,
      storyKey: original?.storyKey ?? entry.canonicalIdentity,
      rankingPolicyVersion: READER_SUMMARY_EDITORIAL_SLATE_VERSION,
      representativeFeedItemId: entry.candidateId,
      duplicateFeedItemIds: support.map((item) => item.feedItemId),
      interestIds: uniqueSorted(members.map((item) => item.interestId)),
      providerKeys: uniqueSorted(members.map((item) => item.providerKey)),
      // Coverage planning consumes the clustering score's wider signal scale.
      // The v2 unit score orders the immutable slate, but substituting it here
      // collapses every multi-story slate into single-story coverage.
      score: original?.score ?? entry.scoreComponents.total,
      observedAtRange: {
        startedAt: new Date(Math.min(...observedAt)),
        endedAt: new Date(Math.max(...observedAt)),
      },
      whyImportant: uniqueSorted(
        members.flatMap((item) => item.whyImportant),
      ),
    });
  }
  for (const item of params.supplementalEvidence ?? []) {
    if (!seenEvidenceIds.has(item.feedItemId)) {
      seenEvidenceIds.add(item.feedItemId);
      orderedEvidence.push(item);
    }
  }
  const clusterIds = new Set(clusters.map((cluster) => cluster.id));

  return {
    ...params.selection,
    rankingPolicyVersion: READER_SUMMARY_EDITORIAL_SLATE_VERSION,
    editorialSlate: params.slate,
    selectedEvidence: orderedEvidence,
    clusters,
    sourceWindow: {
      ...params.selection.sourceWindow,
      selectedFeedItemIds: orderedEvidence.map((item) => item.feedItemId),
      storyClusterIds: params.selection.sourceWindow.storyClusterIds.filter(
        (id) => clusterIds.has(id),
      ),
    },
  };
};

const semanticRepresentatives = (params: {
  readonly ranked: readonly AdmittedReaderPromotionV2[];
  readonly semanticStoryIdByEvidenceId: ReadonlyMap<string, string>;
}): {
  readonly representatives: readonly AdmittedReaderPromotionV2[];
  readonly duplicateExclusions: readonly {
    readonly candidateId: string;
    readonly canonicalIdentity: string;
    readonly reasonCodes: readonly string[];
  }[];
} => {
  const representatives: AdmittedReaderPromotionV2[] = [];
  const duplicateExclusions = [];
  const seenStoryIds = new Set<string>();
  for (const candidate of params.ranked) {
    const semanticStoryId = params.semanticStoryIdByEvidenceId.get(
      candidate.candidateId,
    ) ?? `canonical:${candidate.canonicalIdentity}`;
    if (seenStoryIds.has(semanticStoryId)) {
      duplicateExclusions.push({
        candidateId: candidate.candidateId,
        canonicalIdentity: candidate.canonicalIdentity,
        reasonCodes: ["semantic_story_duplicate"] as readonly string[],
      });
      continue;
    }
    representatives.push(candidate);
    seenStoryIds.add(semanticStoryId);
  }
  return { representatives, duplicateExclusions };
};

const slateEntry = (params: {
  readonly candidate: AdmittedReaderPromotionV2;
  readonly placement: ReaderSummaryEditorialPlacement;
  readonly slot: number;
  readonly storyClusterId: string;
  readonly reasonCodes: readonly string[];
}): ReaderSummaryEditorialSlateEntry => {
  const scoreComponents = Object.freeze({ ...params.candidate.components });
  const reasonCodes = Object.freeze([...params.reasonCodes]);
  const digestInput = JSON.stringify({
    policyVersion: READER_SUMMARY_EDITORIAL_SLATE_VERSION,
    placement: params.placement,
    slot: params.slot,
    candidateId: params.candidate.candidateId,
    canonicalIdentity: params.candidate.canonicalIdentity,
    provider: params.candidate.provider,
    storyClusterId: params.storyClusterId,
    scoreComponents,
    reasonCodes,
    candidateDigestInput: params.candidate.digestInput,
  });
  return Object.freeze({
    policyVersion: READER_SUMMARY_EDITORIAL_SLATE_VERSION,
    placement: params.placement,
    slot: params.slot,
    candidateId: params.candidate.candidateId,
    canonicalIdentity: params.candidate.canonicalIdentity,
    provider: params.candidate.provider,
    storyClusterId: params.storyClusterId,
    scoreComponents,
    reasonCodes,
    candidateDigestInput: params.candidate.digestInput,
    digestInput,
  });
};

const clusterMembership = (
  clusters: readonly StoryCluster[],
): ReadonlyMap<string, string> => {
  const result = new Map<string, string>();
  for (const cluster of clusters) {
    for (const id of [
      cluster.representativeFeedItemId,
      ...cluster.duplicateFeedItemIds,
    ]) {
      const current = result.get(id);
      if (current !== undefined && current !== cluster.id) {
        throw new Error(`Summary evidence belongs to multiple clusters: ${id}`);
      }
      result.set(id, cluster.id);
    }
  }
  return result;
};

const semanticStoryMembership = (
  selection: SummaryEvidenceSelection,
): ReadonlyMap<string, string> => {
  const parentById = new Map<string, string>();
  const add = (id: string): void => {
    if (!parentById.has(id)) parentById.set(id, id);
  };
  const root = (id: string): string => {
    add(id);
    const parent = parentById.get(id)!;
    if (parent === id) return id;
    const result = root(parent);
    parentById.set(id, result);
    return result;
  };
  const union = (left: string, right: string): void => {
    const leftRoot = root(left);
    const rightRoot = root(right);
    if (leftRoot === rightRoot) return;
    const [first, second] = [leftRoot, rightRoot].sort((a, b) =>
      a.localeCompare(b));
    parentById.set(second!, first!);
  };

  for (const item of selection.selectedEvidence) add(item.feedItemId);
  for (const cluster of selection.clusters) {
    const ids = [
      cluster.representativeFeedItemId,
      ...cluster.duplicateFeedItemIds,
    ];
    for (const id of ids.slice(1)) union(ids[0]!, id);
  }
  for (const relation of selection.approvedSameStoryRelations ?? []) {
    union(relation.leftFeedItemId, relation.rightFeedItemId);
  }
  const canonicalOwner = new Map<string, string>();
  for (const item of selection.selectedEvidence) {
    const identity = item.promotionFacts?.canonicalIdentity.trim();
    if (!identity) continue;
    const owner = canonicalOwner.get(identity);
    if (owner === undefined) canonicalOwner.set(identity, item.feedItemId);
    else union(owner, item.feedItemId);
  }

  return new Map([...parentById.keys()].sort((left, right) =>
    left.localeCompare(right)).map((id) => [id, root(id)] as const));
};

const storyClusterId = (
  candidate: AdmittedReaderPromotionV2,
  clusterIdByEvidenceId: ReadonlyMap<string, string>,
): string => clusterIdByEvidenceId.get(candidate.candidateId) ??
  `promotion:${candidate.canonicalIdentity}`;

const uniqueSorted = (values: readonly string[]): readonly string[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));
