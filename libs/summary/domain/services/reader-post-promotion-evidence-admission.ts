import type {
  SummaryEvidenceContentQuality,
  SummaryEvidenceConversationAncestor,
  SummaryEvidenceConversationContext,
  SummaryEvidenceConversationUnit,
  SummaryEvidenceItem,
  SummaryEvidencePromotionFacts,
  SummaryEvidencePromotionMetrics,
  SummaryEvidenceSelection,
} from "../value-objects/summary-evidence-item";
import { buildReaderPostPromotionProjection } from
  "./reader-post-promotion-projection";
import { selectGitHubTrendingSupplementalEvidence } from
  "../policies/reader-summary-github-trending-policy";

type AdmittedPromotionEvidence = Omit<
  SummaryEvidenceSelection,
  "promotionAttestations" | "promotionCounts"
> & {
  readonly promotionCounts: { readonly top: number; readonly additional: number };
};

export const admitReaderPostPromotionEvidence = (
  selection: SummaryEvidenceSelection,
): AdmittedPromotionEvidence => {
  if (selection.editorialSlate !== undefined) {
    return admittedEditorialSlateSelection(selection);
  }
  const provisionalCitations = selection.selectedEvidence.map((item) => ({
    citationId: `promotion-preflight:${item.feedItemId}`,
    feedItemId: item.feedItemId,
    sourceItemId: item.sourceItemId,
    providerKey: item.providerKey,
    field: "canonicalUrl" as const,
    canonicalUrl: item.canonicalUrl,
  }));
  const projection = buildReaderPostPromotionProjection({
    evidence: selection.selectedEvidence,
    clusters: selection.clusters,
    citations: provisionalCitations,
    sourceWindow: selection.sourceWindow,
    approvedSameStoryRelations: selection.approvedSameStoryRelations,
    relatedTopicRelations: selection.relatedTopicRelations,
  });
  const supplementalEvidence = selectGitHubTrendingSupplementalEvidence(
    selection.selectedEvidence,
  );
  const admittedEvidence = [
    ...projection.admittedEvidence,
    ...supplementalEvidence,
  ].map(
    admittedSummaryEvidenceItem,
  );
  const admittedIds = new Set(admittedEvidence.map((item) => item.feedItemId));
  const admittedClusters = projection.admittedClusters;
  return {
    rankingPolicyVersion: selection.rankingPolicyVersion,
    personalization: selection.personalization === undefined ? undefined : {
      memoryGuidanceStatus: selection.personalization.memoryGuidanceStatus,
      memoryGuidanceApplied: selection.personalization.memoryGuidanceApplied,
      providerPreferenceCount: selection.personalization.providerPreferenceCount,
      keywordPreferenceCount: selection.personalization.keywordPreferenceCount,
      mutedKeywordCount: selection.personalization.mutedKeywordCount,
      blockedProviderCount: selection.personalization.blockedProviderCount,
      signals: selection.personalization.signals.map((signal) => signal),
    },
    sourceWindow: {
      windowId: selection.sourceWindow.windowId,
      startedAt: new Date(selection.sourceWindow.startedAt.getTime()),
      endedAt: new Date(selection.sourceWindow.endedAt.getTime()),
      selectedFeedItemIds: admittedEvidence.map((item) => item.feedItemId),
      storyClusterIds: admittedClusters.map((cluster) => cluster.id),
      periodStartedAt: copyDate(selection.sourceWindow.periodStartedAt),
      periodEndedAt: copyDate(selection.sourceWindow.periodEndedAt),
      ingestionCutoff: copyDate(selection.sourceWindow.ingestionCutoff),
    },
    clusters: admittedClusters.map((cluster) => ({
      id: cluster.id,
      storyKey: cluster.storyKey,
      rankingPolicyVersion: cluster.rankingPolicyVersion,
      representativeFeedItemId: cluster.representativeFeedItemId,
      duplicateFeedItemIds: cluster.duplicateFeedItemIds.map((id) => id),
      interestIds: cluster.interestIds.map((id) => id),
      providerKeys: cluster.providerKeys.map((key) => key),
      score: cluster.score,
      signalBreakdown: cluster.signalBreakdown === undefined ? undefined : {
        baseScore: cluster.signalBreakdown.baseScore,
        crossProviderSupport: cluster.signalBreakdown.crossProviderSupport,
        sameProviderSupport: cluster.signalBreakdown.sameProviderSupport,
        providerDiversityBoost: cluster.signalBreakdown.providerDiversityBoost,
        interestDiversityBoost: cluster.signalBreakdown.interestDiversityBoost,
        freshnessBoost: cluster.signalBreakdown.freshnessBoost,
        totalScore: cluster.signalBreakdown.totalScore,
      },
      observedAtRange: {
        startedAt: new Date(cluster.observedAtRange.startedAt.getTime()),
        endedAt: new Date(cluster.observedAtRange.endedAt.getTime()),
      },
      whyImportant: cluster.whyImportant.map((reason) => reason),
    })),
    selectedEvidence: admittedEvidence,
    approvedSameStoryRelations: (selection.approvedSameStoryRelations ?? [])
      .filter((relation) => admittedIds.has(relation.leftFeedItemId) &&
        admittedIds.has(relation.rightFeedItemId))
      .map((relation) => ({
        leftFeedItemId: relation.leftFeedItemId,
        rightFeedItemId: relation.rightFeedItemId,
        confidence: relation.confidence,
      })),
    relatedTopicRelations: [],
    promotionCounts: {
      top: projection.topReads.length,
      additional: projection.additionalPosts.length,
    },
  };
};

const admittedEditorialSlateSelection = (
  selection: SummaryEvidenceSelection,
): AdmittedPromotionEvidence => {
  const editorialSlate = selection.editorialSlate;
  if (editorialSlate === undefined) {
    throw new Error("Reader summary editorial slate is required");
  }
  const admittedEvidence = selection.selectedEvidence.map(
    admittedSummaryEvidenceItem,
  );
  const admittedIds = new Set(
    admittedEvidence.map((item) => item.feedItemId),
  );
  return {
    rankingPolicyVersion: selection.rankingPolicyVersion,
    ...(selection.personalization === undefined
      ? {}
      : { personalization: {
          ...selection.personalization,
          signals: [...selection.personalization.signals],
        } }),
    editorialSlate,
    sourceWindow: {
      ...selection.sourceWindow,
      startedAt: new Date(selection.sourceWindow.startedAt.getTime()),
      endedAt: new Date(selection.sourceWindow.endedAt.getTime()),
      selectedFeedItemIds: admittedEvidence.map((item) => item.feedItemId),
      storyClusterIds: selection.clusters.map((cluster) => cluster.id),
      periodStartedAt: copyDate(selection.sourceWindow.periodStartedAt),
      periodEndedAt: copyDate(selection.sourceWindow.periodEndedAt),
      ingestionCutoff: copyDate(selection.sourceWindow.ingestionCutoff),
    },
    clusters: selection.clusters.map((cluster) => ({
      ...cluster,
      duplicateFeedItemIds: [...cluster.duplicateFeedItemIds],
      interestIds: [...cluster.interestIds],
      providerKeys: [...cluster.providerKeys],
      observedAtRange: {
        startedAt: new Date(cluster.observedAtRange.startedAt.getTime()),
        endedAt: new Date(cluster.observedAtRange.endedAt.getTime()),
      },
      whyImportant: [...cluster.whyImportant],
    })),
    selectedEvidence: admittedEvidence,
    approvedSameStoryRelations: (selection.approvedSameStoryRelations ?? [])
      .filter((relation) => admittedIds.has(relation.leftFeedItemId) &&
        admittedIds.has(relation.rightFeedItemId))
      .map((relation) => ({ ...relation })),
    relatedTopicRelations: [],
    promotionCounts: {
      top: editorialSlate.top.length,
      additional: editorialSlate.additional.length,
    },
  };
};

export const admissibleReaderPostPromotionCandidateIds = (
  selection: SummaryEvidenceSelection,
): ReadonlySet<string> => {
  const projection = buildReaderPostPromotionProjection({
    evidence: selection.selectedEvidence,
    clusters: selection.clusters,
    citations: selection.selectedEvidence.map((item) => ({
      citationId: `promotion-preflight:${item.feedItemId}`,
      feedItemId: item.feedItemId,
      sourceItemId: item.sourceItemId,
      providerKey: item.providerKey,
      field: "canonicalUrl" as const,
      canonicalUrl: item.canonicalUrl,
    })),
    sourceWindow: selection.sourceWindow,
    approvedSameStoryRelations: selection.approvedSameStoryRelations,
    relatedTopicRelations: selection.relatedTopicRelations,
  });
  return new Set(projection.evaluatedEvidence.flatMap((evaluation) =>
    evaluation.decision === "promote_top" ||
      evaluation.decision === "promote_additional"
      ? [evaluation.candidateId]
      : []));
};

const copyDate = (value: Date | undefined): Date | undefined =>
  value === undefined ? undefined : new Date(value.getTime());

export const admittedSummaryEvidenceItem = (
  item: SummaryEvidenceItem,
): SummaryEvidenceItem => ({
  feedItemId: item.feedItemId,
  sourceItemId: item.sourceItemId,
  sourceBindingId: item.sourceBindingId,
  interestId: item.interestId,
  providerKey: item.providerKey,
  providerName: item.providerName,
  canonicalUrl: item.canonicalUrl,
  sourceOriginUrl: item.sourceOriginUrl,
  title: item.title,
  bodyPreview: item.bodyPreview,
  sourceText: item.sourceText,
  authorHandle: item.authorHandle,
  publishedAt: new Date(item.publishedAt.getTime()),
  observedAt: new Date(item.observedAt.getTime()),
  score: item.score,
  whyImportant: item.whyImportant.map((reason) => reason),
  providerMetricLabels: item.providerMetricLabels?.map((metric) => ({
    label: metric.label,
    value: metric.value,
  })),
  providerMetricSummary: item.providerMetricSummary,
  previewMedia: item.previewMedia === undefined ? undefined : {
    kind: item.previewMedia.kind,
    url: item.previewMedia.url,
    sourceUrl: item.previewMedia.sourceUrl,
    altText: item.previewMedia.altText,
  },
  conversationContext: item.conversationContext === undefined
    ? undefined
    : admittedConversationContext(item.conversationContext),
  contentQuality: item.contentQuality === undefined
    ? undefined
    : admittedContentQuality(item.contentQuality),
  promotionFacts: item.promotionFacts === undefined
    ? undefined
    : admittedPromotionFacts(item.promotionFacts),
  readerActionKind: item.readerActionKind,
  matchedRules: item.matchedRules?.map((rule) => rule),
  storyKeyHint: item.storyKeyHint,
});

const admittedContentQuality = (
  quality: SummaryEvidenceContentQuality,
): SummaryEvidenceContentQuality => ({
  qualityScore: quality.qualityScore,
  interestRelevanceScore: quality.interestRelevanceScore,
  engagementIntegrityScore: quality.engagementIntegrityScore,
  eligibleForSummary: quality.eligibleForSummary,
  eligibleForTopRead: quality.eligibleForTopRead,
  needsLlmReview: quality.needsLlmReview,
  decision: quality.decision,
  flags: quality.flags.map((flag) => flag),
  reason: quality.reason,
});

const admittedPromotionFacts = (
  facts: SummaryEvidencePromotionFacts,
): SummaryEvidencePromotionFacts => ({
  contentKind: facts.contentKind,
  canonicalIdentity: facts.canonicalIdentity,
  checkedAt: facts.checkedAt === undefined
    ? undefined
    : new Date(facts.checkedAt.getTime()),
  engagementAuthority: facts.engagementAuthority === undefined
    ? undefined
    : {
        observedAt: new Date(facts.engagementAuthority.observedAt.getTime()),
        regressionState: facts.engagementAuthority.regressionState,
      },
  authorityAttestation: facts.authorityAttestation === undefined
    ? undefined
    : {
        status: facts.authorityAttestation.status,
        official: facts.authorityAttestation.official,
        trusted: facts.authorityAttestation.trusted,
        attestedBy: facts.authorityAttestation.attestedBy,
      },
  officialAccount: facts.officialAccount,
  trustedAuthor: facts.trustedAuthor,
  safetyValid: facts.safetyValid,
  freshnessValid: facts.freshnessValid,
  ...(facts.freshnessProvenance === undefined
    ? {}
    : { freshnessProvenance: facts.freshnessProvenance.status === "unknown"
        ? { status: "unknown" as const }
        : {
            status: "observed" as const,
            publishedAt: new Date(facts.freshnessProvenance.publishedAt),
            observedAt: new Date(facts.freshnessProvenance.observedAt),
            ingestionCutoff: new Date(facts.freshnessProvenance.ingestionCutoff),
            exactPublishedAt: facts.freshnessProvenance.exactPublishedAt,
            exactObservedAt: facts.freshnessProvenance.exactObservedAt,
            exactIngestionCutoff: facts.freshnessProvenance.exactIngestionCutoff,
          } }),
  metricsState: facts.metricsState,
  metrics: facts.metrics === undefined
    ? undefined
    : admittedPromotionMetrics(facts.metrics),
});

const admittedPromotionMetrics = (
  metrics: SummaryEvidencePromotionMetrics,
): SummaryEvidencePromotionMetrics => {
  switch (metrics.provider) {
    case "x":
      return {
        provider: metrics.provider,
        likes: metrics.likes,
        reposts: metrics.reposts,
        weightedScore: metrics.weightedScore,
      };
    case "reddit":
      return {
        provider: metrics.provider,
        score: metrics.score,
        upvoteRatio: metrics.upvoteRatio,
      };
    case "hacker_news":
      return { provider: metrics.provider, points: metrics.points };
    case "github_radar":
      return {
        provider: metrics.provider,
        snapshotKind: metrics.snapshotKind,
        windowStartedAt: new Date(metrics.windowStartedAt.getTime()),
        windowEndedAt: new Date(metrics.windowEndedAt.getTime()),
        starsDelta: metrics.starsDelta,
        forksDelta: metrics.forksDelta,
      };
  }
};

const admittedConversationContext = (
  context: SummaryEvidenceConversationContext,
): SummaryEvidenceConversationContext => ({
  rankingBasis: context.rankingBasis,
  bundleScore: context.bundleScore,
  units: context.units.map(admittedConversationUnit),
});

const admittedConversationUnit = (
  unit: SummaryEvidenceConversationUnit,
): SummaryEvidenceConversationUnit => ({
  conversationUnitId: unit.conversationUnitId,
  providerUnitId: unit.providerUnitId,
  parentProviderUnitId: unit.parentProviderUnitId,
  threadExternalId: unit.threadExternalId,
  canonicalUrl: unit.canonicalUrl,
  authorHandle: unit.authorHandle,
  body: unit.body,
  score: unit.score,
  providerScore: unit.providerScore,
  replyCount: unit.replyCount,
  signalBand: unit.signalBand,
  depth: unit.depth,
  role: unit.role,
  selectionReason: unit.selectionReason,
  ancestry: unit.ancestry?.map(admittedConversationAncestor),
  publishedAt: unit.publishedAt,
});

const admittedConversationAncestor = (
  ancestor: SummaryEvidenceConversationAncestor,
): SummaryEvidenceConversationAncestor => ({
  conversationUnitId: ancestor.conversationUnitId,
  providerUnitId: ancestor.providerUnitId,
  parentProviderUnitId: ancestor.parentProviderUnitId,
  threadExternalId: ancestor.threadExternalId,
  canonicalUrl: ancestor.canonicalUrl,
  authorHandle: ancestor.authorHandle,
  body: ancestor.body,
  score: ancestor.score,
  providerScore: ancestor.providerScore,
  replyCount: ancestor.replyCount,
  signalBand: ancestor.signalBand,
  depth: ancestor.depth,
  role: ancestor.role,
  selectionReason: ancestor.selectionReason,
  publishedAt: ancestor.publishedAt,
});
