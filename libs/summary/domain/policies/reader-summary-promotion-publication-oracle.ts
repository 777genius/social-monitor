import type { ReaderSummaryCitation } from "../entities/citation";
import type {
  ApprovedSameStoryRelation,
  RelatedTopicRelation,
  StoryCluster,
  SummaryEvidenceItem,
  SummarySourceWindow,
} from "../value-objects/summary-evidence-item";
import type { ReaderSummaryEditorialSlate } from
  "../value-objects/reader-summary-editorial-slate";
import { READER_POST_PROMOTION_POLICY_V1 } from
  "./reader-post-promotion-policy-contract";
import { readerPostPromotionTimestampMicros } from
  "./reader-post-promotion-policy";
import { readerPostPromotionTopProviderCap } from
  "./top-read-provider-diversity-policy";

export type PromotionOracleCard = {
  readonly candidateId: string;
  readonly canonicalIdentity: string;
  readonly placement: "top" | "additional";
  readonly citationIds: readonly string[];
};

type Candidate = {
  readonly item: SummaryEvidenceItem;
  readonly canonicalIdentity: string;
  readonly placement: "top" | "additional";
  readonly engagementPlacement: "top" | "additional" | null;
  readonly strength: number;
  readonly usefulness: number;
  readonly citationId: string;
};

export const readerSummaryPromotionPublicationOracle = (params: {
  readonly evidence: readonly SummaryEvidenceItem[];
  readonly citations: readonly ReaderSummaryCitation[];
  readonly sourceWindow: SummarySourceWindow;
  readonly clusters?: readonly StoryCluster[];
  readonly approvedSameStoryRelations?: readonly ApprovedSameStoryRelation[];
  readonly relatedTopicRelations?: readonly RelatedTopicRelation[];
  readonly editorialSlate?: ReaderSummaryEditorialSlate;
}): { readonly top: readonly PromotionOracleCard[]; readonly additional: readonly PromotionOracleCard[] } => {
  if (params.editorialSlate !== undefined) {
    return editorialSlateOracle({
      citations: params.citations,
      clusters: params.clusters,
      editorialSlate: params.editorialSlate,
    });
  }
  const citationByFeedItem = new Map<string, ReaderSummaryCitation>();
  for (const citation of [...params.citations].sort((a, b) =>
    a.citationId.localeCompare(b.citationId))) {
    if (!citationByFeedItem.has(citation.feedItemId)) {
      citationByFeedItem.set(citation.feedItemId, citation);
    }
  }
  const periodStart = params.sourceWindow.periodStartedAt ?? params.sourceWindow.startedAt;
  const periodEnd = params.sourceWindow.periodEndedAt ?? params.sourceWindow.endedAt;
  const cutoff = params.sourceWindow.ingestionCutoff ?? periodEnd;
  const relatedTopicSubjects = new Set(
    (params.relatedTopicRelations ?? []).map((relation) =>
      relation.subjectFeedItemId),
  );
  const evaluated = params.evidence.flatMap((item): Candidate[] => {
    const citation = citationByFeedItem.get(item.feedItemId);
    const result = independentlyEvaluate(item, citation, periodStart, periodEnd, cutoff);
    return result === null || relatedTopicSubjects.has(item.feedItemId)
      ? []
      : [result];
  });
  const evaluatedById = new Map(evaluated.map((item) =>
    [item.item.feedItemId, item] as const));
  const clusterByFeedItemId = new Map<string, string>();
  for (const cluster of params.clusters ?? []) {
    for (const id of [cluster.representativeFeedItemId,
      ...cluster.duplicateFeedItemIds]) clusterByFeedItemId.set(id, cluster.id);
  }
  const relationSupport = independentSameStorySupport({
    relations: params.approvedSameStoryRelations ?? [],
    evaluatedById,
  });
  const supportIds = new Set([...relationSupport.values()].map((item) =>
    item.support.item.feedItemId));
  const representatives = new Map<string, Candidate>();
  const candidatesByGroup = new Map<string, Candidate[]>();
  for (const candidate of evaluated) {
    if (supportIds.has(candidate.item.feedItemId)) continue;
    const group = clusterByFeedItemId.get(candidate.item.feedItemId) ??
      `canonical:${candidate.canonicalIdentity}`;
    const members = candidatesByGroup.get(group) ?? [];
    members.push(candidate);
    candidatesByGroup.set(group, members);
    const current = representatives.get(group);
    if (current === undefined || compareCanonical(candidate, current) < 0) {
      representatives.set(group, candidate);
    }
  }
  const supportsByIdentity = new Map<string, SummaryEvidenceItem[]>();
  for (const {
    lead, support, confidence, independentlyAdditionalEligible,
  } of relationSupport.values()) {
    if (confidence < READER_POST_PROMOTION_POLICY_V1.sameStoryConfidenceMinimum ||
        !independentlyAdditionalEligible ||
        ![...representatives.values()].some((representative) =>
          representative.item.feedItemId ===
          lead.item.feedItemId)) continue;
    const current = supportsByIdentity.get(lead.canonicalIdentity) ?? [];
    if (!current.some((item) => item.feedItemId === support.item.feedItemId)) {
      current.push(support.item);
      supportsByIdentity.set(lead.canonicalIdentity, current);
    }
  }
  const materialize = (candidate: Candidate): PromotionOracleCard => ({
    candidateId: candidate.item.feedItemId,
    canonicalIdentity: candidate.canonicalIdentity,
    placement: candidate.placement,
    citationIds: [...new Set([
      candidate.citationId,
      ...[...candidatesByGroup.values()].find((members) =>
        members.some((member) => member.item.feedItemId ===
          candidate.item.feedItemId))?.flatMap((member) =>
            citationByFeedItem.get(member.item.feedItemId)?.citationId ?? []) ?? [],
      ...(supportsByIdentity.get(candidate.canonicalIdentity) ?? []).flatMap(
        (item) => citationByFeedItem.get(item.feedItemId)?.citationId ?? [],
      ),
    ])].sort((a, b) => a.localeCompare(b)),
  });
  const selected = [...representatives.values()];
  const topCandidates = selected.filter((item) => item.placement === "top")
    .sort(compareRank);
  const topProviderCount = new Set(topCandidates.flatMap((item) => {
    const provider = independentProviderFamily(item.item.providerKey);
    return provider === null ? [] : [provider];
  })).size;
  return {
    top: diverseOracle(
      topCandidates,
      READER_POST_PROMOTION_POLICY_V1.maxTop,
      readerPostPromotionTopProviderCap(topProviderCount),
    )
      .map(materialize),
    additional: diverseOracle(selected.filter((item) => item.placement === "additional")
      .sort(compareRank), READER_POST_PROMOTION_POLICY_V1.maxAdditional)
      .map(materialize),
  };
};

const editorialSlateOracle = (params: {
  readonly citations: readonly ReaderSummaryCitation[];
  readonly clusters?: readonly StoryCluster[];
  readonly editorialSlate: ReaderSummaryEditorialSlate;
}): {
  readonly top: readonly PromotionOracleCard[];
  readonly additional: readonly PromotionOracleCard[];
} => {
  const citationByFeedItemId = new Map(params.citations.map((citation) =>
    [citation.feedItemId, citation] as const));
  const clusterById = new Map((params.clusters ?? []).map((cluster) =>
    [cluster.id, cluster] as const));
  const materialize = (
    entry: ReaderSummaryEditorialSlate["top"][number],
  ): PromotionOracleCard => {
    const cluster = clusterById.get(entry.storyClusterId);
    const feedItemIds = cluster === undefined
      ? [entry.candidateId]
      : [
          cluster.representativeFeedItemId,
          ...cluster.duplicateFeedItemIds,
        ];
    return {
      candidateId: entry.candidateId,
      canonicalIdentity: entry.canonicalIdentity,
      placement: entry.placement,
      citationIds: [...new Set(feedItemIds.flatMap((feedItemId) => {
        const citation = citationByFeedItemId.get(feedItemId);
        return citation === undefined ? [] : [citation.citationId];
      }))].sort((left, right) => left.localeCompare(right)),
    };
  };
  return {
    top: params.editorialSlate.top.map(materialize),
    additional: params.editorialSlate.additional.map(materialize),
  };
};

const independentlyEvaluate = (
  item: SummaryEvidenceItem,
  citation: ReaderSummaryCitation | undefined,
  periodStart: Date,
  periodEnd: Date,
  cutoff: Date,
): Candidate | null => {
  const facts = item.promotionFacts;
  const quality = item.contentQuality;
  const provider = independentProviderFamily(item.providerKey);
  if (facts === undefined || quality === undefined || citation === undefined ||
      provider === null ||
      citation.feedItemId !== item.feedItemId || citation.sourceItemId !== item.sourceItemId ||
      citation.providerKey !== item.providerKey ||
      (citation.canonicalUrl !== undefined && citation.canonicalUrl !== item.canonicalUrl) ||
      !facts.safetyValid || !facts.freshnessValid ||
      facts.freshnessProvenance?.status !== "observed" ||
      !sameDisplayMillisecond(facts.freshnessProvenance.exactPublishedAt,
        facts.freshnessProvenance.publishedAt, item.publishedAt) ||
      !sameDisplayMillisecond(facts.freshnessProvenance.exactObservedAt,
        facts.freshnessProvenance.observedAt, item.observedAt) ||
      !sameDisplayMillisecond(facts.freshnessProvenance.exactIngestionCutoff,
        facts.freshnessProvenance.ingestionCutoff, cutoff) ||
      micros(facts.freshnessProvenance.exactPublishedAt, item.publishedAt) <
        micros(undefined, periodStart) ||
      micros(facts.freshnessProvenance.exactPublishedAt, item.publishedAt) >=
        micros(undefined, periodEnd) ||
      micros(facts.freshnessProvenance.exactObservedAt, item.observedAt) <
        micros(facts.freshnessProvenance.exactPublishedAt, item.publishedAt) ||
      micros(facts.freshnessProvenance.exactObservedAt, item.observedAt) >
        micros(facts.freshnessProvenance.exactIngestionCutoff, cutoff) ||
      !unit(quality.qualityScore) || !unit(quality.interestRelevanceScore) ||
      !unit(quality.engagementIntegrityScore) || !quality.eligibleForSummary ||
      !quality.eligibleForTopRead || quality.needsLlmReview ||
      quality.decision === "downrank" || quality.decision === "reject" ||
      facts.canonicalIdentity.trim() === "" || facts.metricsState !== "observed" ||
      facts.metrics === undefined || facts.metrics.provider !== provider ||
      facts.contentKind !== READER_POST_PROMOTION_POLICY_V1.contentKinds[provider]) return null;
  const engagement = independentEngagement(facts.metrics, facts.checkedAt, cutoff);
  if (engagement === null) return null;
  if (engagement.placement === null) return null;
  const placement = engagement.placement;
  const startMicros = micros(undefined, periodStart);
  const endMicros = micros(undefined, periodEnd);
  const publishedMicros = micros(
    facts.freshnessProvenance.exactPublishedAt,
    item.publishedAt,
  );
  const duration = endMicros - startMicros;
  const freshness = duration <= 0n ? 0 : Math.max(0, Math.min(1,
    Number(publishedMicros - startMicros) / Number(duration)));
  const weights = READER_POST_PROMOTION_POLICY_V1.additionalUsefulnessWeights;
  return {
    item,
    canonicalIdentity: facts.canonicalIdentity.trim(),
    placement,
    engagementPlacement: engagement.placement,
    strength: engagement.strength,
    usefulness: weights.normalizedStrength * engagement.strength +
      weights.qualityScore * quality.qualityScore +
      weights.interestRelevanceScore * quality.interestRelevanceScore +
      weights.engagementIntegrityScore * quality.engagementIntegrityScore +
      weights.freshness * freshness,
    citationId: citation.citationId,
  };
};

const independentEngagement = (
  metrics: NonNullable<NonNullable<SummaryEvidenceItem["promotionFacts"]>["metrics"]>,
  checkedAt: Date | undefined,
  cutoff: Date,
): { readonly placement: "top" | "additional" | null; readonly strength: number } | null => {
  if (metrics.provider === "x") {
    if (![metrics.likes, metrics.reposts, metrics.weightedScore].every(count) ||
        metrics.weightedScore !== metrics.likes + 2 * metrics.reposts) return null;
    const f = READER_POST_PROMOTION_POLICY_V1.floors.x;
    return { placement: metrics.weightedScore >= f.top.weighted &&
      (metrics.likes >= f.top.likes || metrics.reposts >= f.top.reposts) ? "top" :
      metrics.weightedScore >= f.additional.weighted &&
      (metrics.likes >= f.additional.likes || metrics.reposts >= f.additional.reposts) ? "additional" : null,
      strength: Math.min(1, metrics.weightedScore / f.top.weighted) };
  }
  if (metrics.provider === "reddit") {
    if (!count(metrics.score) ||
        (metrics.upvoteRatio !== undefined && !unit(metrics.upvoteRatio))) return null;
    const f = READER_POST_PROMOTION_POLICY_V1.floors.reddit;
    return { placement: metrics.score >= f.top.score &&
      (metrics.upvoteRatio === undefined || metrics.upvoteRatio >= f.top.trustedRatio) ? "top" :
      metrics.score >= f.additional.score &&
      (metrics.upvoteRatio === undefined || metrics.upvoteRatio >= f.additional.trustedRatio) ? "additional" : null,
      strength: Math.min(1, metrics.score / f.top.score) };
  }
  if (metrics.provider === "hacker_news") {
    if (!count(metrics.points)) return null;
    const f = READER_POST_PROMOTION_POLICY_V1.floors.hackerNews;
    return { placement: metrics.points >= f.topPoints ? "top" :
      metrics.points >= f.additionalPoints ? "additional" : null,
      strength: Math.min(1, metrics.points / f.topPoints) };
  }
  const start = metrics.windowStartedAt.getTime();
  const end = metrics.windowEndedAt.getTime();
  const hours = (end - start) / 3_600_000;
  if (metrics.snapshotKind !== "repository_growth" ||
      !count(metrics.starsDelta) || !count(metrics.forksDelta) ||
      (hours !== 24 && hours !== 48) ||
      checkedAt?.getTime() !== end || end > cutoff.getTime()) return null;
  const f = READER_POST_PROMOTION_POLICY_V1.floors.githubRadar;
  const top = metrics.starsDelta >= f.top.starsDelta ||
    metrics.forksDelta >= f.top.forksDelta;
  const additional = metrics.starsDelta >= f.additional.starsDelta ||
    metrics.forksDelta >= f.additional.forksDelta;
  return { placement: top ? "top" : additional ? "additional" : null,
    strength: Math.min(1, Math.max(metrics.starsDelta / f.top.starsDelta,
      metrics.forksDelta / f.top.forksDelta)) };
};

const independentSameStorySupport = (params: {
  readonly relations: readonly ApprovedSameStoryRelation[];
  readonly evaluatedById: ReadonlyMap<string, Candidate>;
}): ReadonlyMap<string, {
  readonly lead: Candidate;
  readonly support: Candidate;
  readonly confidence: number;
  readonly independentlyAdditionalEligible: boolean;
}> => {
  const result = new Map<string, {
    readonly lead: Candidate;
    readonly support: Candidate;
    readonly confidence: number;
    readonly independentlyAdditionalEligible: boolean;
  }>();
  for (const relation of params.relations) {
    if (!unit(relation.confidence)) continue;
    const left = params.evaluatedById.get(relation.leftFeedItemId);
    const right = params.evaluatedById.get(relation.rightFeedItemId);
    if (left === undefined || right === undefined ||
        independentProviderFamily(left.item.providerKey) ===
          independentProviderFamily(right.item.providerKey)) continue;
    const lead = compareRelationLead(left, right) <= 0 ? left : right;
    const support = lead === left ? right : left;
    const current = result.get(support.item.feedItemId);
    if (current === undefined || relation.confidence > current.confidence) {
      result.set(support.item.feedItemId, { lead, support,
        confidence: relation.confidence,
        independentlyAdditionalEligible:
          isSourceCatalogAuthority(support.item) &&
          support.engagementPlacement !== null,
      });
    }
  }
  return result;
};

const compareRelationLead = (a: Candidate, b: Candidate): number =>
  Number(b.placement === "top") - Number(a.placement === "top") ||
  b.strength - a.strength ||
  Number(isExactAttestedAuthority(b.item)) -
    Number(isExactAttestedAuthority(a.item)) ||
  (b.item.contentQuality?.qualityScore ?? 0) -
    (a.item.contentQuality?.qualityScore ?? 0) ||
  a.item.feedItemId.localeCompare(b.item.feedItemId);

const isExactAttestedAuthority = (item: SummaryEvidenceItem): boolean => {
  const authority = item.promotionFacts?.authorityAttestation;
  return authority?.status === "attested" && authority.official === true &&
    authority.trusted === true &&
    (independentProviderFamily(item.providerKey) !== "x" ||
      authority.attestedBy === "source_catalog");
};

const isSourceCatalogAuthority = (item: SummaryEvidenceItem): boolean =>
  item.promotionFacts?.authorityAttestation?.status === "attested" &&
  item.promotionFacts.authorityAttestation.trusted === true &&
  item.promotionFacts.authorityAttestation.attestedBy === "source_catalog";

const independentProviderFamily = (
  providerKey: string,
): keyof typeof READER_POST_PROMOTION_POLICY_V1.contentKinds | null => {
  const normalized = providerKey.trim().toLowerCase();
  for (const provider of Object.keys(
    READER_POST_PROMOTION_POLICY_V1.providerAliases,
  ) as (keyof typeof READER_POST_PROMOTION_POLICY_V1.providerAliases)[]) {
    if ((READER_POST_PROMOTION_POLICY_V1.providerAliases[provider] as
      readonly string[]).includes(normalized)) return provider;
  }
  return null;
};
const compareCanonical = (a: Candidate, b: Candidate): number =>
  Number(b.placement === "top") - Number(a.placement === "top") || compareRank(a, b);
const compareRank = (a: Candidate, b: Candidate): number =>
  b.usefulness - a.usefulness || comparePublishedMicros(a.item, b.item) ||
  a.canonicalIdentity.localeCompare(b.canonicalIdentity) ||
  a.item.feedItemId.localeCompare(b.item.feedItemId);
const micros = (exact: string | undefined, display: Date): bigint => {
  const value = readerPostPromotionTimestampMicros(exact ?? display);
  if (value === undefined) throw new Error("Invalid promotion timestamp provenance");
  return value;
};
const sameDisplayMillisecond = (
  exact: string | undefined,
  provenanceDisplay: Date,
  boundDisplay: Date,
): boolean => {
  const exactValue = micros(exact, provenanceDisplay);
  return exactValue / 1_000n === micros(undefined, provenanceDisplay) / 1_000n &&
    provenanceDisplay.getTime() === boundDisplay.getTime();
};
const comparePublishedMicros = (
  left: SummaryEvidenceItem,
  right: SummaryEvidenceItem,
): number => {
  const leftFacts = left.promotionFacts?.freshnessProvenance;
  const rightFacts = right.promotionFacts?.freshnessProvenance;
  const leftValue = micros(
    leftFacts?.status === "observed" ? leftFacts.exactPublishedAt : undefined,
    left.publishedAt,
  );
  const rightValue = micros(
    rightFacts?.status === "observed" ? rightFacts.exactPublishedAt : undefined,
    right.publishedAt,
  );
  return leftValue === rightValue ? 0 : rightValue > leftValue ? 1 : -1;
};
const diverseOracle = (
  sorted: readonly Candidate[],
  cap: number,
  providerCap = cap,
): readonly Candidate[] => {
  const selected: Candidate[] = [];
  const selectedIds = new Set<string>();
  const providers = new Set<string>();
  for (const candidate of sorted) {
    const provider = independentProviderFamily(candidate.item.providerKey);
    if (provider === null || providers.has(provider)) continue;
    selected.push(candidate);
    selectedIds.add(candidate.item.feedItemId);
    providers.add(provider);
    if (selected.length === cap) return selected;
  }
  for (const candidate of sorted) {
    if (selectedIds.has(candidate.item.feedItemId)) continue;
    const provider = independentProviderFamily(candidate.item.providerKey);
    if (provider === null) continue;
    const providerCount = selected.reduce(
      (count, selectedCandidate) =>
        independentProviderFamily(selectedCandidate.item.providerKey) === provider
          ? count + 1
          : count,
      0,
    );
    if (providerCount >= providerCap) continue;
    selected.push(candidate);
    if (selected.length === cap) break;
  }
  return selected;
};
const count = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const unit = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
