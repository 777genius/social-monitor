import type { ReaderSummaryCitation } from "../entities/citation";
import type { TopRead } from "../entities/top-read";
import type { StoryCluster, SummaryEvidenceItem, SummarySourceWindow } from
  "../value-objects/summary-evidence-item";
import { normalizeSignalScore } from "../value-objects/signal-score";
import { buildReaderPostPromotionAttestationV3 } from
  "./reader-post-promotion-attestation-v3";
import { publicReaderPostPresentationV3Seal, readerPostPresentationV3MatchesCard } from
  "./reader-post-presentation-v3";
import { capturedReaderSource, readerCapturedSourceDigest } from
  "./reader-post-display-headline";
import type { ReaderPostPromotionProjection,
  ReaderPostPromotionProjectionInput } from "./reader-post-promotion-projection";

export const buildReaderPostPromotionV3Projection = (
  params: ReaderPostPromotionProjectionInput,
  evidenceById: ReadonlyMap<string, SummaryEvidenceItem>,
  citationByFeedItemId: ReadonlyMap<string, ReaderSummaryCitation>,
): ReaderPostPromotionProjection => {
  const selection = params.promotionV3!;
  const selected = [
    ...selection.top.map((candidate, index) => ({ candidate,
      placement: "top" as const, slot: index + 1 })),
    ...selection.additional.map((candidate, index) => ({ candidate,
      placement: "additional" as const, slot: index + 1 })),
  ];
  const cards = selected.map(({ candidate, placement }) => {
    const lead = requiredEvidence(evidenceById, candidate.candidateId);
    const citation = citationByFeedItemId.get(candidate.candidateId);
    const headline = lead.readerHeadline;
    const source = capturedReaderSource(lead);
    const privateSeal = headline?.status === "accepted" ? {
      headline,
      capturedSourceDigest: readerCapturedSourceDigest(source),
    } : undefined;
    if (headline?.status !== "accepted" || citation === undefined ||
        privateSeal === undefined || !citationMatchesEvidence(citation, lead) ||
        !readerPostPresentationV3MatchesCard({
          title: headline.text,
          providerKey: candidate.providerKey,
          candidateId: candidate.candidateId,
          capturedSource: source,
          headline,
          seal: privateSeal,
          tenantId: headline.binding.tenantId,
          workspaceId: headline.binding.workspaceId,
        })) {
      throw new Error("Promotion V3 selected evidence is not display-ready");
    }
    const seal = publicReaderPostPresentationV3Seal(privateSeal);
    const publicHeadline = seal.headline;
    if (publicHeadline.status !== "accepted") {
      throw new Error("Promotion V3 public presentation is unavailable");
    }
    const story = (params.topStories ?? []).find((value) =>
      value.storyClusterId === candidate.storyId);
    const confidence = Math.min(candidate.answers.usefulness.confidence,
      candidate.answers.relevance.confidence);
    return { storyClusterId: candidate.storyId,
      cardKind: placement === "top" ? "curated_top_read" as const
        : "additional_notable_story" as const,
      promotionMarker: "reader_post_promotion" as const,
      promotionPolicyVersion: "reader_post_promotion.v3" as const,
      promotionTier: placement, promotionCandidateId: candidate.candidateId,
      promotionCanonicalIdentity: candidate.canonicalIdentity,
      title: publicHeadline.text, displayHeadline: publicHeadline,
      capturedSource: source, providerKey: candidate.providerKey,
      ...(story?.summary === undefined ? {} : { summary: story.summary }),
      providerName: lead.providerName ?? candidate.providerKey,
      primaryActionKind: lead.readerActionKind ?? "read_source" as const,
      reason: "Selected by reader-value semantic assessment.",
      matchedInterestIds: [lead.interestId], matchedRules: [
        `reader-value:usefulness:${candidate.answers.usefulness.choice}`,
        `reader-value:relevance:${candidate.answers.relevance.choice}`,
      ],
      signalScore: normalizeSignalScore(0),
      confidence: { level: confidence >= 0.8 ? "high" as const
        : confidence >= 0.55 ? "medium" as const : "low" as const,
      score: confidence,
      rationale: "Confidence is diagnostic only and does not affect V3 order." },
      confirmedProviderKeys: [candidate.providerKey], providerMetrics: [],
      whyImportant: [candidate.answers.usefulness.choice === "important"
        ? "Assessed as important and directly relevant."
        : "Assessed as useful and directly relevant."],
      whyNow: "Selected from the frozen summary window.",
      publishedAt: new Date(candidate.publishedAt),
      exactPublishedAt: candidate.publishedAt,
      canonicalUrl: lead.canonicalUrl,
      previewMedia: lead.previewMedia, citationIds: [citation.citationId],
    } satisfies TopRead;
  });
  const selectedIds = new Set(selected.map(({ candidate }) => candidate.candidateId));
  const admittedEvidence = selected.map(({ candidate }) =>
    requiredEvidence(evidenceById, candidate.candidateId));
  const admittedClusters = selected.map(({ candidate }, index): StoryCluster => {
    const existing = params.clusters.find((cluster) => cluster.id === candidate.storyId ||
      cluster.representativeFeedItemId === candidate.candidateId ||
      cluster.duplicateFeedItemIds.includes(candidate.candidateId));
    const lead = admittedEvidence[index]!;
    return existing === undefined ? { id: candidate.storyId, storyKey: candidate.storyId,
      rankingPolicyVersion: "reader_promotion_policy.v3",
      representativeFeedItemId: candidate.candidateId, duplicateFeedItemIds: [],
      interestIds: [lead.interestId], providerKeys: [candidate.providerKey], score: 0,
      observedAtRange: { startedAt: lead.observedAt, endedAt: lead.observedAt },
      whyImportant: [] } : { ...existing, id: candidate.storyId,
      rankingPolicyVersion: "reader_promotion_policy.v3",
      representativeFeedItemId: candidate.candidateId };
  });
  const cardById = new Map(cards.map((card) => [card.promotionCandidateId!, card]));
  const attestations = params.attestationBinding === undefined ? [] : selected.map(
    ({ candidate, placement, slot }) => {
      const card = cardById.get(candidate.candidateId)!;
      return buildReaderPostPromotionAttestationV3({ candidate, placement, slot,
        binding: { artifactId: params.attestationBinding!.artifactId,
          sourceWindowId: params.sourceWindow.windowId,
          periodStartedAt: requiredDate(params.sourceWindow.periodStartedAt),
          periodEndedAt: requiredDate(params.sourceWindow.periodEndedAt),
          ingestionCutoff: requiredDate(params.sourceWindow.ingestionCutoff),
          exactIngestionCutoff: requiredExactCutoff(params.sourceWindow),
          citationIds: card.citationIds, assessedAt: candidate.assessedAt,
          rubricVersion: candidate.rubricVersion,
          displayHeadline: { headline: card.displayHeadline!,
            capturedSourceDigest: readerCapturedSourceDigest(card.capturedSource!) } } });
    });
  return { topReads: cards.filter((card) => card.promotionTier === "top"),
    additionalPosts: cards.filter((card) => card.promotionTier === "additional"),
    admittedEvidence,
    admittedCitations: params.citations.filter((citation) =>
      selectedIds.has(citation.feedItemId)), admittedClusters,
    topClusterIds: new Set(selection.top.map((candidate) => candidate.storyId)),
    attestations, attestedEvidenceFacts: [],
    evaluatedEvidence: params.evidence.map((item) => ({ candidateId: item.feedItemId,
      decision: selection.top.some((candidate) => candidate.candidateId === item.feedItemId)
        ? "promote_top" : selection.additional.some((candidate) =>
          candidate.candidateId === item.feedItemId) ? "promote_additional" : "reject" })) };
};

const requiredDate = (value: Date | undefined): Date => {
  if (value === undefined || !Number.isFinite(value.getTime())) {
    throw new Error("Promotion V3 source window binding is incomplete");
  }
  return value;
};
const requiredExactCutoff = (sourceWindow: SummarySourceWindow): string => {
  const value = sourceWindow.exactIngestionCutoff;
  if (value === undefined ||
      sourceWindow.ingestionCutoff === undefined ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      Date.parse(value) !== sourceWindow.ingestionCutoff.getTime()) {
    throw new Error("Promotion V3 exact ingestion cutoff binding is incomplete");
  }
  return value;
};
const requiredEvidence = (items: ReadonlyMap<string, SummaryEvidenceItem>, id: string) => {
  const item = items.get(id);
  if (item === undefined) throw new Error(`Missing promoted evidence: ${id}`);
  return item;
};
const citationMatchesEvidence = (citation: ReaderSummaryCitation,
  evidence: SummaryEvidenceItem) => citation.feedItemId === evidence.feedItemId &&
  citation.sourceItemId === evidence.sourceItemId &&
  citation.providerKey === evidence.providerKey &&
  (citation.canonicalUrl === undefined || citation.canonicalUrl === evidence.canonicalUrl);
