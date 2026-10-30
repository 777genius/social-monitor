import { validateReaderValueAnswers } from
  "@social-monitor/relevance/domain/reader-value/reader-value-assessment";

import type {
  ReaderPostPromotionAttestationV3,
  ReaderPostPromotionComparator,
  ReaderPostPromotionPlacement,
} from "../policies/reader-post-promotion-policy-contract";
import {
  readerPostPromotionMetricMature,
  readerPostPromotionSignalScore,
  signedReaderPostPromotionPopularity,
  type ReaderPostPromotionSignalMethod,
} from "../policies/reader-post-promotion-engagement";
import { readerPromotionNewsPublisher } from
  "../policies/reader-promotion-news-publisher";
import {
  READER_PROMOTION_LIMITS,
  READER_PROMOTION_POLICY_STAMP,
  compareRankedReaderPromotion,
  compareUnrankedReaderPromotion,
  readerPromotionSemanticallyAdmitted,
} from "../policies/reader-promotion-ranking";
import { readerPromotionSourceForProviderKey } from
  "../policies/reader-promotion-source-registry";
import { canonicalPromotionPayload, verifyReaderPostPromotionAttestationDigest } from
  "../services/reader-post-promotion-attestation";
import { readerPostPresentationV3Identity, readerPostPresentationV3MatchesCard } from
  "../services/reader-post-presentation-v3";
import type { ReaderSummaryArtifactProps } from "./reader-summary-artifact";
import { sameOrderedValues } from "./reader-summary-artifact-validation-values";
import type { TopRead } from "./top-read";

type Lane = {
  readonly card: TopRead;
  readonly placement: ReaderPostPromotionPlacement;
  readonly slot: number;
};

const signalMethods: ReadonlySet<ReaderPostPromotionSignalMethod> = new Set([
  "likes_plus_two_reposts", "reddit_score", "hacker_news_points",
  "max_stars_or_half_forks",
]);
const decisions = Object.freeze({
  top: "promote_top", additional: "promote_additional", news: "promote_news",
} as const);
const exactTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u;

/**
 * Independent check of a published promotion board. Block membership,
 * metric maturity, popularity, card signal and order are recomputed from the
 * signed attestations and the source registry; card fields are only bound to
 * them, never used as ordering input.
 */
export const assertReaderPromotionAttestations = (
  props: ReaderSummaryArtifactProps,
  attestations: readonly ReaderPostPromotionAttestationV3[],
): void => {
  if ((props.promotionEvidenceFacts ?? []).length !== 0) {
    throw new Error("Reader promotion must not persist legacy score facts");
  }
  const promoted = (cards: readonly TopRead[] | undefined) => (cards ?? [])
    .filter((card) => card.promotionMarker === "reader_post_promotion");
  const lanes: Lane[] = [
    ...promoted(props.content?.topReads).map((card, index) =>
      ({ card, placement: "top" as const, slot: index + 1 })),
    ...promoted(props.content?.selectedPosts).map((card, index) =>
      ({ card, placement: "additional" as const, slot: index + 1 })),
    ...promoted(props.content?.newsWithoutRatingPosts).map((card, index) =>
      ({ card, placement: "news" as const, slot: index + 1 })),
  ];
  const count = (placement: ReaderPostPromotionPlacement): number =>
    lanes.filter((lane) => lane.placement === placement).length;
  // Show more continues Top, so it can only exist behind a full Top.
  if (count("top") > READER_PROMOTION_LIMITS.top ||
      count("top") + count("additional") > READER_PROMOTION_LIMITS.rankedTotal ||
      count("additional") > 0 && count("top") !== READER_PROMOTION_LIMITS.top ||
      count("news") > READER_PROMOTION_LIMITS.news) {
    throw new Error("Reader promotion placement cap is invalid");
  }
  if (lanes.length !== attestations.length) {
    throw new Error("Every promoted card requires one attestation");
  }
  const candidateIds = new Set<string>();
  for (const [index, attestation] of attestations.entries()) {
    const lane = lanes[index];
    if (lane === undefined || candidateIds.has(attestation.candidateId) ||
        !attestationMatchesLane(props, attestation, lane) ||
        !comparatorIsConsistent(attestation, lane.card)) {
      throw new Error("Reader promotion attestation is invalid");
    }
    candidateIds.add(attestation.candidateId);
  }
  assertOrder(attestations);
  assertUniqueness(attestations);
  assertPopularityCohorts(attestations);
};

const attestationMatchesLane = (
  props: ReaderSummaryArtifactProps,
  attestation: ReaderPostPromotionAttestationV3,
  { card, placement, slot }: Lane,
): boolean => {
  const assessment = attestation.assessment;
  return attestation.policyVersion === READER_PROMOTION_POLICY_STAMP &&
    attestation.digestVersion === "reader_post_promotion_digest.sha256.v3" &&
    verifyReaderPostPromotionAttestationDigest(attestation) &&
    attestation.artifactId === props.readerSummaryId &&
    attestation.sourceWindowId === props.sourceWindow.windowId &&
    attestation.periodStartedAt.getTime() === props.sourceWindow.periodStartedAt?.getTime() &&
    attestation.periodEndedAt.getTime() === props.sourceWindow.periodEndedAt?.getTime() &&
    attestation.ingestionCutoff.getTime() === props.sourceWindow.ingestionCutoff?.getTime() &&
    attestation.exactIngestionCutoff === props.sourceWindow.exactIngestionCutoff &&
    Date.parse(attestation.exactIngestionCutoff) === attestation.ingestionCutoff.getTime() &&
    attestation.placement === placement && attestation.slot === slot &&
    attestation.decision === decisions[placement] &&
    attestation.candidateId === card.promotionCandidateId &&
    attestation.provider === card.providerKey &&
    attestation.canonicalIdentity === card.promotionCanonicalIdentity &&
    card.promotionPolicyVersion === READER_PROMOTION_POLICY_STAMP &&
    card.promotionTier === placement &&
    attestation.storyId === card.storyClusterId &&
    [assessment.sourceSnapshotSha256, assessment.inputSha256, assessment.rubricSha256,
      attestation.presentation.presentationInputDigest]
      .every((value) => /^[0-9a-f]{64}$/u.test(value)) &&
    attestation.presentation.presentationIdentity === readerPostPresentationV3Identity({
      sourceSnapshotSha256: assessment.sourceSnapshotSha256,
      presentationInputDigest: attestation.presentation.presentationInputDigest,
      displayHeadline: attestation.presentation.displayHeadline,
    }) &&
    exactTimestamp.test(assessment.assessedAt) && Number.isFinite(Date.parse(assessment.assessedAt)) &&
    exactTimestamp.test(attestation.publishedAt) &&
    Number.isFinite(Date.parse(attestation.publishedAt)) &&
    validateReaderValueAnswers(assessment.answers).ok &&
    sameOrderedValues(attestation.citationIds, card.citationIds) &&
    attestation.presentation.displayHeadline.headline.status === "accepted" &&
    canonicalPromotionPayload(attestation.presentation.displayHeadline.headline) ===
      canonicalPromotionPayload(card.displayHeadline) &&
    readerPostPresentationV3MatchesCard({
      title: card.title,
      providerKey: card.providerKey,
      candidateId: card.promotionCandidateId,
      capturedSource: card.capturedSource,
      headline: card.displayHeadline,
      seal: attestation.presentation.displayHeadline,
      tenantId: props.tenantId,
      workspaceId: props.workspaceId,
    }) && card.exactPublishedAt === attestation.publishedAt;
};

const comparatorIsConsistent = (
  attestation: ReaderPostPromotionAttestationV3,
  card: TopRead,
): boolean => {
  const comparator: ReaderPostPromotionComparator = attestation.comparator;
  const answers = attestation.assessment.answers;
  const source = readerPromotionSourceForProviderKey(attestation.provider);
  const engagement = comparator.engagement;
  const engagementValid = engagement === null || (
    signalMethods.has(engagement.method) && Number.isFinite(engagement.value) &&
    engagement.value >= 0 && exactTimestamp.test(engagement.observedAt) &&
    Number.isFinite(Date.parse(engagement.observedAt)));
  if (source === undefined || !engagementValid) return false;
  const metricMature = comparator.block === "ranked" && engagement !== null &&
    readerPostPromotionMetricMature(engagement, attestation.publishedAt);
  const newsPublisher = comparator.block === "unranked"
    ? readerPromotionNewsPublisher({
      canonicalIdentity: attestation.canonicalIdentity,
      title: card.capturedSource?.title ?? "",
    }) : null;
  return comparator.providerFamily === source.family &&
    comparator.block === source.engagementClass &&
    (comparator.block === "unranked") === (attestation.placement === "news") &&
    (comparator.block === "ranked" || engagement === null) &&
    comparator.usefulness === answers.usefulness.choice &&
    comparator.relevance === answers.relevance.choice &&
    readerPromotionSemanticallyAdmitted(comparator) &&
    comparator.publishedAt === attestation.publishedAt &&
    comparator.candidateId === attestation.candidateId &&
    comparator.metricMature === metricMature &&
    // A mature metric may still lack popularity when its family is below the
    // minimum cohort; assertPopularityCohorts keeps that uniform per family.
    (comparator.popularity === null ||
      (metricMature && signedReaderPostPromotionPopularity(comparator.popularity))) &&
    comparator.newsPublisher === newsPublisher &&
    card.signalScore === readerPostPromotionSignalScore(comparator.popularity);
};

/** Top then Show more is one ranked sequence; news is a second one. */
const assertOrder = (attestations: readonly ReaderPostPromotionAttestationV3[]): void => {
  for (const [placements, compare] of [
    [["top", "additional"], compareRankedReaderPromotion],
    [["news"], compareUnrankedReaderPromotion],
  ] as const) {
    const keys = (placements as readonly string[]).flatMap((placement) => attestations
      .filter((value) => value.placement === placement).map((value) => value.comparator));
    if (keys.some((key, index) => index > 0 && compare(keys[index - 1]!, key) > 0)) {
      throw new Error("Reader promotion order is invalid");
    }
  }
};

/** One story per page, one real publisher per news block. */
const assertUniqueness = (
  attestations: readonly ReaderPostPromotionAttestationV3[],
): void => {
  const publishers = attestations.flatMap((value) =>
    value.comparator.newsPublisher === null ? [] : [value.comparator.newsPublisher]);
  if (new Set(attestations.map((value) => value.storyId)).size !== attestations.length ||
      new Set(publishers).size !== publishers.length) {
    throw new Error("Reader promotion story or publisher is duplicated");
  }
};

/**
 * Popularity is signed as cohort counts. Members of one family must share a
 * cohort size, and a larger metric can never sit below a smaller one. Mature
 * members of one family either all carry popularity or, below the minimum
 * cohort, all carry none.
 */
const assertPopularityCohorts = (
  attestations: readonly ReaderPostPromotionAttestationV3[],
): void => {
  const familiesWithout = new Set(attestations
    .filter(({ comparator }) => comparator.metricMature && comparator.popularity === null)
    .map(({ comparator }) => comparator.providerFamily));
  const byFamily = new Map<string, ReaderPostPromotionComparator[]>();
  for (const { comparator } of attestations) {
    if (comparator.popularity === null) continue;
    if (familiesWithout.has(comparator.providerFamily)) {
      throw new Error("Reader promotion popularity cohort is inconsistent");
    }
    byFamily.set(comparator.providerFamily,
      [...(byFamily.get(comparator.providerFamily) ?? []), comparator]);
  }
  for (const members of byFamily.values()) {
    const consistent = members.every((left) => members.every((right) => {
      const l = left.popularity!;
      const r = right.popularity!;
      const lv = left.engagement!.value;
      const rv = right.engagement!.value;
      return l.cohortSize === r.cohortSize &&
        (lv > rv ? l.below >= r.below + r.equal
          : lv === rv ? l.below === r.below && l.equal === r.equal : true);
    }));
    if (!consistent || members.length > members[0]!.popularity!.cohortSize) {
      throw new Error("Reader promotion popularity cohort is inconsistent");
    }
  }
};
