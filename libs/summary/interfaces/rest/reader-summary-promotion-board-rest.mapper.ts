import { readerPostPromotionCardFields } from "../../domain/entities/top-read";
import { readerSummaryIndependentProviderFamily } from
  "../../domain/value-objects/reader-summary-provider-identity";
import type { ReaderSummaryArtifactView } from
  "../../features/shared/reader-summary-artifact-presenter";
import {
  READER_POST_PROMOTION_ATTESTATION_SCHEMA_VERSION,
  READER_POST_PROMOTION_DIGEST_VERSION,
  type ReaderSummaryPromotionAttestationDto,
} from "./reader-summary-promotion-attestation.dto";
import type { ReaderSummaryReaderItemDto } from "./reader-summary-reader.dto";
import {
  readerPostPromotionDigest,
  sameOrderedStrings,
} from "./reader-summary-rest-attestation";
import type { ReaderSummaryCitationView } from "./reader-summary-rest.view";

export type ReaderSummaryPromotionBoardRestView = Readonly<{
  topReads: readonly ReaderSummaryReaderItemDto[];
  selectedPosts: readonly ReaderSummaryReaderItemDto[];
}>;

export const readerSummaryPromotionBoardRestView = (
  view: ReaderSummaryArtifactView,
): ReaderSummaryPromotionBoardRestView => {
  const hasLegacyPromotionBoardState =
    view.promotionBoardState === "legacy_unavailable";
  const legacyPromotionBoardUnavailable =
    isLegacyPromotionBoardUnavailable(view);
  if (hasLegacyPromotionBoardState && !legacyPromotionBoardUnavailable) {
    throw new ReaderSummaryPromotionBoardMappingError();
  }
  if (legacyPromotionBoardUnavailable) {
    return { topReads: [], selectedPosts: [] };
  }
  const authority = buildReaderCardRestAuthority(view);
  if (authority === undefined) {
    throw new ReaderSummaryPromotionBoardMappingError();
  }
  return {
    topReads: readerSummaryReaderItemsView(
      view.content.topReads,
      authority,
      "top",
    ),
    selectedPosts: readerSummaryReaderItemsView(
      view.content.selectedPosts ?? [],
      authority,
      "additional",
    ),
  };
};

const isLegacyPromotionBoardUnavailable = (
  view: ReaderSummaryArtifactView,
): boolean => {
  if (
    view.promotionBoardState !== "legacy_unavailable" ||
    view.promotionAttestations.length > 0
  ) {
    return false;
  }
  const cards = [
    ...view.content.topReads,
    ...(view.content.selectedPosts ?? []),
    ...view.content.interestSections.flatMap((section) => section.items),
  ];
  return cards.every((card) => readerPostPromotionCardFields.every(
    (field) => !Object.prototype.hasOwnProperty.call(card, field),
  ));
};

export class ReaderSummaryPromotionBoardMappingError extends Error {
  constructor() {
    super("Reader summary promotion board is invalid");
    this.name = "ReaderSummaryPromotionBoardMappingError";
  }
}

const readerSummaryReaderItemsView = (
  items: readonly ReaderSummaryArtifactView["content"]["topReads"][number][],
  authority: ReaderCardRestAuthority,
  placement: "top" | "additional",
): readonly ReaderSummaryReaderItemDto[] => {
  const mapped = items.map((item, slot) =>
    readerSummaryReaderItemView(item, authority, placement, slot));
  if (mapped.some((item) => item === undefined)) {
    throw new ReaderSummaryPromotionBoardMappingError();
  }
  return mapped as readonly ReaderSummaryReaderItemDto[];
};

const readerSummaryReaderItemView = (
  item: ReaderSummaryArtifactView["content"]["topReads"][number],
  authority: ReaderCardRestAuthority,
  placement: "top" | "additional",
  slot: number,
): ReaderSummaryReaderItemDto | undefined => {
  const storyClusterId = item.storyClusterId?.trim();
  const explicitCardKind =
    item.cardKind === "curated_top_read" ||
    item.cardKind === "additional_notable_story"
      ? item.cardKind
      : undefined;
  const expectedCardKind = placement === "top"
    ? "curated_top_read"
    : "additional_notable_story";
  const clusterCardIsAuthorized =
    explicitCardKind === expectedCardKind &&
    isAuthorizedClusterRestItem(item, authority);
  const promotionAttestation = promotionAttestationView(
    item,
    authority,
    placement,
    slot,
  );
  if (!clusterCardIsAuthorized || promotionAttestation === undefined ||
      item.relationId !== undefined ||
      item.targetStoryClusterId !== undefined) {
    return undefined;
  }
  const {
    storyClusterId: ignoredClusterId,
    cardKind: ignoredCardKind,
    relationId: ignoredRelationId,
    targetStoryClusterId: ignoredTargetClusterId,
    promotionMarker: ignoredPromotionMarker,
    promotionPolicyVersion: ignoredPromotionPolicyVersion,
    promotionTier: ignoredPromotionTier,
    promotionCandidateId: ignoredPromotionCandidateId,
    promotionCanonicalIdentity: ignoredPromotionCanonicalIdentity,
    ...rest
  } = item;
  void ignoredClusterId;
  void ignoredCardKind;
  void ignoredRelationId;
  void ignoredTargetClusterId;
  void ignoredPromotionMarker;
  void ignoredPromotionPolicyVersion;
  void ignoredPromotionTier;
  void ignoredPromotionCandidateId;
  void ignoredPromotionCanonicalIdentity;
  return {
    ...rest,
    promotionAttestation,
    matchedRules: [
      ...rest.matchedRules.filter((rule) => !isReservedReaderMarker(rule)),
      `reader-card-kind:${explicitCardKind}`,
      ...(storyClusterId === undefined
        ? []
        : [`reader-story-cluster:${storyClusterId}`]),
    ],
  };
};

type ReaderCardRestAuthority = Readonly<{
  artifactId: string;
  sourceWindowId: string;
  citations: ReadonlyMap<string, ReaderSummaryCitationView>;
  clusters: ReadonlyMap<
    string,
    ReaderSummaryArtifactView["storyClusters"][number]
  >;
  promotionAttestations: ReadonlyMap<
    string,
    ReaderSummaryArtifactView["promotionAttestations"][number]
  >;
}>;

const buildReaderCardRestAuthority = (
  view: ReaderSummaryArtifactView,
): ReaderCardRestAuthority | undefined => {
  try {
    const clusterById = new Map(view.storyClusters.map((cluster) => [cluster.id, cluster]));
    for (const cluster of view.storyClusters) {
      for (const feedItemId of [
        cluster.representativeFeedItemId,
        ...cluster.duplicateFeedItemIds,
      ]) {
        if ([...clusterById.values()].filter((candidate) =>
          candidate.representativeFeedItemId === feedItemId ||
          candidate.duplicateFeedItemIds.includes(feedItemId)
        ).length !== 1) return undefined;
      }
    }
    const citations = new Map(
      view.citations.map((citation) => [citation.citationId, citation]),
    );
    if (citations.size !== view.citations.length) return undefined;
    const promotionAttestations = new Map(view.promotionAttestations.map(
      (attestation) => [attestation.candidateId, attestation] as const,
    ));
    const topCards = view.content.topReads;
    const additionalCards = view.content.selectedPosts ?? [];
    if (topCards.length > 8 || additionalCards.length > 8) return undefined;
    const promotionCards = [...topCards, ...additionalCards];
    const promotionCandidateIds = promotionCards.map((item) =>
      item.promotionCandidateId?.trim() ?? "",
    );
    const promotionCanonicalIdentities = promotionCards.map((item) =>
      item.promotionCanonicalIdentity?.trim() ?? "",
    );
    if (promotionAttestations.size !== view.promotionAttestations.length ||
        promotionAttestations.size !== promotionCards.length ||
        new Set(promotionCandidateIds).size !== promotionCards.length ||
        new Set(promotionCanonicalIdentities).size !== promotionCards.length ||
        promotionCanonicalIdentities.some((identity) => identity.length === 0) ||
        promotionCandidateIds.some((candidateId) =>
          candidateId.length === 0 || !promotionAttestations.has(candidateId))) {
      return undefined;
    }
    const lanes = [
      ...topCards.map((item, slot) => ({ item, slot, placement: "top" as const })),
      ...additionalCards.map((item, slot) => ({
        item,
        slot,
        placement: "additional" as const,
      })),
    ];
    if (lanes.some(({ item, slot, placement }) => {
      const candidateId = item.promotionCandidateId?.trim() ?? "";
      const canonicalIdentity = item.promotionCanonicalIdentity?.trim() ?? "";
      const attestation = promotionAttestations.get(candidateId);
      return attestation === undefined ||
        attestation.candidateId !== candidateId ||
        attestation.canonicalIdentity !== canonicalIdentity ||
        attestation.placement !== placement ||
        attestation.slot !== slot;
    })) return undefined;
    return {
      artifactId: view.readerSummaryId,
      sourceWindowId: view.sourceWindow.windowId,
      citations,
      clusters: clusterById,
      promotionAttestations,
    };
  } catch {
    return undefined;
  }
};

const promotionAttestationView = (
  item: ReaderSummaryArtifactView["content"]["topReads"][number],
  authority: ReaderCardRestAuthority,
  placement: "top" | "additional",
  slot: number,
): ReaderSummaryPromotionAttestationDto | undefined => {
  const decision = placement === "top"
    ? "promote_top" as const
    : placement === "additional"
      ? "promote_additional" as const
      : undefined;
  const candidateId = item.promotionCandidateId?.trim();
  const canonicalIdentity = item.promotionCanonicalIdentity?.trim();
  if (decision === undefined ||
      item.promotionMarker !== "reader_post_promotion" ||
      item.promotionPolicyVersion !== "reader_post_promotion.v1" ||
      item.promotionTier !== placement || candidateId === undefined ||
      candidateId.length === 0 || canonicalIdentity === undefined ||
      canonicalIdentity.length === 0) return undefined;
  const attestation = authority.promotionAttestations.get(candidateId);
  if (attestation === undefined ||
      attestation.policyVersion !== "reader_post_promotion.v1" ||
      attestation.candidateId !== candidateId ||
      attestation.canonicalIdentity !== canonicalIdentity ||
      attestation.artifactId !== authority.artifactId ||
      attestation.sourceWindowId !== authority.sourceWindowId ||
      attestation.placement !== placement || attestation.slot !== slot ||
      !sameOrderedStrings(attestation.citationIds, item.citationIds) ||
      attestation.tier !== placement || attestation.decision !== decision ||
      attestation.canonicalDedupeOutcome !== "retained" ||
      attestation.capOutcome !== "selected" ||
      attestation.schemaVersion !== READER_POST_PROMOTION_ATTESTATION_SCHEMA_VERSION ||
      attestation.digestVersion !== READER_POST_PROMOTION_DIGEST_VERSION ||
      readerPostPromotionDigest(attestation.canonicalPayload) !==
        attestation.digest) return undefined;
  return {
    schemaVersion: attestation.schemaVersion,
    policyVersion: attestation.policyVersion,
    digestVersion: attestation.digestVersion,
    digest: attestation.digest,
    canonicalPayload: attestation.canonicalPayload,
    artifactId: attestation.artifactId,
    sourceWindowId: attestation.sourceWindowId,
    slot: attestation.slot,
    candidateId,
    canonicalIdentity,
    placement,
    decision,
    citationIds: [...attestation.citationIds],
  };
};

const isAuthorizedClusterRestItem = (
  item: ReaderSummaryArtifactView["content"]["topReads"][number],
  authority: ReaderCardRestAuthority,
): boolean => {
  const cluster = item.storyClusterId === undefined
    ? undefined
    : authority.clusters.get(item.storyClusterId);
  if (cluster === undefined || new Set(item.citationIds).size !== item.citationIds.length) {
    return false;
  }
  const feedItemIds = new Set([
    cluster.representativeFeedItemId,
    ...cluster.duplicateFeedItemIds,
  ]);
  const clusterProviders = new Set(cluster.providerKeys.map(normalizedProvider));
  const citations = item.citationIds.map((citationId) =>
    authority.citations.get(citationId),
  );
  if (citations.some((citation) =>
    citation === undefined ||
    !feedItemIds.has(citation.feedItemId) ||
    !clusterProviders.has(normalizedProvider(citation.providerKey)))) {
    return false;
  }
  const citationProviders = new Set(
    citations.flatMap((citation) =>
      citation === undefined ? [] : [normalizedProvider(citation.providerKey)],
    ),
  );
  const confirmedProviders = new Set(
    item.confirmedProviderKeys.map(normalizedProvider),
  );
  const primaryProvider = normalizedProvider(item.providerKey);
  return citationProviders.has(primaryProvider) &&
    confirmedProviders.size === item.confirmedProviderKeys.length &&
    confirmedProviders.size === citationProviders.size &&
    [...confirmedProviders].every((provider) => citationProviders.has(provider)) &&
    (item.canonicalUrl === undefined || citations.some((citation) =>
      citation !== undefined &&
      normalizedProvider(citation.providerKey) === primaryProvider &&
      citation.canonicalUrl === item.canonicalUrl));
};

const normalizedProvider = (value: string): string =>
  readerSummaryIndependentProviderFamily({ providerKey: value });

const isReservedReaderMarker = (rule: string): boolean => {
  const normalized = rule.trim().toLowerCase();
  return [
    "reader-card-kind:",
    "reader-story-cluster:",
    "reader-related-topic-relation:",
    "reader-related-topic-target:",
  ].some((prefix) => normalized.startsWith(prefix));
};
