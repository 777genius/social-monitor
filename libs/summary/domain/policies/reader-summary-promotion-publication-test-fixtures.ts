import {
  ReaderSummaryArtifact,
  type ReaderSummaryContent,
} from "../entities/reader-summary-artifact";
import { buildReaderPostPromotionProjection } from
  "../services/reader-post-promotion-projection";
import {
  dailyEvidenceSelection,
  dailySynthesisArtifact,
} from "./reader-summary-publication-policy-test-fixtures";

export const promotionPublicationFixture = (secondPoints: number) => {
  const evidence = dailyEvidenceSelection(secondPoints);
  const base = dailySynthesisArtifact();
  const snapshot = base.toSnapshot();
  const promotion = buildReaderPostPromotionProjection({
    evidence: evidence.selectedEvidence,
    clusters: evidence.clusters,
    citations: snapshot.citationMap,
    sourceWindow: evidence.sourceWindow,
    approvedSameStoryRelations: evidence.approvedSameStoryRelations,
    relatedTopicRelations: evidence.relatedTopicRelations,
    editorialSlate: evidence.editorialSlate,
    attestationBinding: {
      artifactId: snapshot.readerSummaryId,
      sourceWindow: evidence.sourceWindow,
    },
  });
  return {
    evidence,
    artifact: withPublicationCards(
      base,
      {
        topReads: promotion.topReads,
        selectedPosts: promotion.additionalPosts,
      },
      promotion.attestations,
      promotion.attestedEvidenceFacts,
    ),
  };
};

export const exactObservedPromotionPublicationFixture = (
  exactObservedAt: string,
) => {
  const source = dailyEvidenceSelection(50);
  const evidence = {
    ...source,
    selectedEvidence: source.selectedEvidence.map((item, index) => {
      if (index !== 0) return item;
      const observedAt = new Date(exactObservedAt);
      return {
        ...item,
        observedAt,
        promotionFacts: {
          ...item.promotionFacts!,
          freshnessProvenance: {
            status: "observed" as const,
            publishedAt: item.publishedAt,
            observedAt,
            ingestionCutoff: source.sourceWindow.ingestionCutoff!,
            exactPublishedAt: "2026-07-05T08:00:00.000000Z",
            exactObservedAt,
            exactIngestionCutoff: "2026-07-05T09:00:00.000000Z",
          },
        },
      };
    }),
  };
  const base = dailySynthesisArtifact();
  const snapshot = base.toSnapshot();
  const promotion = buildReaderPostPromotionProjection({
    evidence: evidence.selectedEvidence,
    clusters: evidence.clusters,
    citations: snapshot.citationMap,
    sourceWindow: evidence.sourceWindow,
    editorialSlate: evidence.editorialSlate,
    attestationBinding: {
      artifactId: snapshot.readerSummaryId,
      sourceWindow: evidence.sourceWindow,
    },
  });
  return withPublicationCards(base, {
    topReads: promotion.topReads,
    selectedPosts: promotion.additionalPosts,
  }, promotion.attestations, promotion.attestedEvidenceFacts);
};

export const trustedNonOfficialSupportPublicationFixture = () => {
  const source = dailyEvidenceSelection(25);
  const evidence = {
    ...source,
    selectedEvidence: source.selectedEvidence.map((item) =>
      item.feedItemId !== "feed-publication-2" ? item : {
        ...item,
        promotionFacts: {
          ...item.promotionFacts!,
          authorityAttestation: {
            status: "attested" as const,
            official: false,
            trusted: true,
            attestedBy: "source_catalog" as const,
          },
        },
      },
    ),
    approvedSameStoryRelations: [{
      leftFeedItemId: "feed-publication-1",
      rightFeedItemId: "feed-publication-2",
      confidence: 0.95,
    }],
  };
  const base = dailySynthesisArtifact();
  const snapshot = base.toSnapshot();
  const promotion = buildReaderPostPromotionProjection({
    evidence: evidence.selectedEvidence,
    clusters: evidence.clusters,
    citations: snapshot.citationMap,
    sourceWindow: evidence.sourceWindow,
    approvedSameStoryRelations: evidence.approvedSameStoryRelations,
    editorialSlate: evidence.editorialSlate,
    attestationBinding: {
      artifactId: snapshot.readerSummaryId,
      sourceWindow: evidence.sourceWindow,
    },
  });
  return {
    evidence,
    artifact: ReaderSummaryArtifact.create({
      ...snapshot,
      period: {
        ...snapshot.period,
        cadence: "custom",
        periodKey: `custom:${snapshot.period.startedAt.toISOString()}:${snapshot.period.endedAt.toISOString()}:${snapshot.period.timezone}`,
      },
      sourceWindow: {
        ...snapshot.sourceWindow,
        storyClusterIds: promotion.admittedClusters.map((cluster) => cluster.id),
      },
      storyClusters: promotion.admittedClusters,
      content: {
        ...snapshot.content!,
        topReads: promotion.topReads,
        selectedPosts: promotion.additionalPosts,
      },
      promotionAttestations: promotion.attestations,
      promotionEvidenceFacts: promotion.attestedEvidenceFacts,
    }),
  };
};

export const withPublicationCards = (
  base: ReaderSummaryArtifact,
  cards: Pick<ReaderSummaryContent, "topReads" | "selectedPosts"> |
    Partial<Pick<ReaderSummaryContent, "topReads" | "selectedPosts">>,
  promotionAttestations = base.toSnapshot().promotionAttestations,
  promotionEvidenceFacts = base.toSnapshot().promotionEvidenceFacts,
): ReaderSummaryArtifact => {
  const snapshot = base.toSnapshot();
  return ReaderSummaryArtifact.create({
    ...snapshot,
    content: { ...snapshot.content!, ...cards },
    promotionAttestations,
    promotionEvidenceFacts,
  });
};

export const withUncheckedPublicationCards = (
  base: ReaderSummaryArtifact,
  cards: Partial<Pick<ReaderSummaryContent, "topReads" | "selectedPosts">>,
): ReaderSummaryArtifact => {
  const snapshot = base.toSnapshot();
  return {
    toSnapshot: () => ({
      ...snapshot,
      content: { ...snapshot.content!, ...cards },
    }),
  } as ReaderSummaryArtifact;
};
