import type { ReaderValueAnswers, ReaderValueCriterion } from
  "@social-monitor/relevance/domain/reader-value/reader-value-assessment";

import { acceptedFixtureReaderHeadline } from
  "../../test-fixtures/accepted-reader-headline";
import { dailyEvidenceSelection, dailySynthesisArtifact } from
  "../policies/reader-summary-publication-policy-test-fixtures";
import { readerDisplayPublicationFindings } from
  "../policies/reader-summary-display-publication";
import { selectReaderPostPromotionsV3, type ReaderPostPromotionV3Candidate } from
  "../policies/reader-post-promotion-v3";
import type { ReaderPostPromotionAttestationV3 } from
  "../policies/reader-post-promotion-policy-contract";
import { READER_PROMOTION_POLICY_STAMP } from "../policies/reader-promotion-ranking";
import { buildReaderPostPromotionProjection } from
  "../services/reader-post-promotion-projection";
import { readerPostPresentationV3InputDigest } from
  "../services/reader-post-presentation-v3";
import { canonicalPromotionPayload, promotionPayloadDigest } from
  "../services/reader-post-promotion-attestation";
import type { TopRead } from "./top-read";
import { assertReaderSummaryPromotionAttestations } from
  "./reader-summary-promotion-attestation-validation";

describe("Reader promotion attestation verification", () => {
  it("accepts a two-block board and recomputes it from signed data", () => {
    const fixture = boardFixture([...redditCohort, { providerKey: "rss" }]);

    expect(fixture.props.content.topReads.map((card) => card.signalScore))
      .toEqual([9, 7, 5, 3, 1]);
    expect(fixture.props.content.newsWithoutRatingPosts.map((card) =>
      card.promotionTier)).toEqual(["news"]);
    expect(fixture.attestations.every((value) =>
      value.policyVersion === READER_PROMOTION_POLICY_STAMP)).toBe(true);
    expect(() => assertReaderSummaryPromotionAttestations(
      fixture.props, fixture.attestations)).not.toThrow();
    expect(readerDisplayPublicationFindings(fixture.props, fixture.evidence))
      .toEqual([]);
  });

  it("accepts a family below the minimum cohort whose mature metrics carry no popularity", () => {
    const fixture = boardFixture([{ providerKey: "reddit", value: 984 },
      { providerKey: "reddit", value: 0 }]);

    expect(fixture.attestations.map((value) => [value.comparator.metricMature,
      value.comparator.popularity])).toEqual([[true, null], [true, null]]);
    expect(fixture.props.content.topReads.map((card) => card.signalScore)).toEqual([0, 0]);
    expect(() => assertReaderSummaryPromotionAttestations(
      fixture.props, fixture.attestations)).not.toThrow();
  });

  it("rejects a family that mixes signed and missing popularity", () => {
    const fixture = boardFixture(redditCohort);
    const last = fixture.attestations.at(-1)!;
    const cards = fixture.props.content.topReads;
    const props = withCards(fixture.props, { topReads: [...cards.slice(0, -1),
      { ...cards.at(-1)!, signalScore: 0 }] });

    expect(() => assertReaderSummaryPromotionAttestations(props, [
      ...fixture.attestations.slice(0, -1),
      reseal(last, { comparator: { ...last.comparator, popularity: null } }),
    ])).toThrow("Reader promotion popularity cohort is inconsistent");
  });

  it("rejects a swapped Top order even when every attestation is resealed", () => {
    const fixture = boardFixture(redditCohort);
    const [first, second, ...rest] = fixture.attestations;
    const [firstCard, secondCard, ...restCards] = fixture.props.content.topReads;
    const props = withCards(fixture.props, { topReads: [secondCard!, firstCard!, ...restCards] });

    expect(() => assertReaderSummaryPromotionAttestations(props, [
      reseal(second!, { slot: 1 }), reseal(first!, { slot: 2 }), ...rest,
    ])).toThrow("Reader promotion order is invalid");
  });

  it.each([
    ["placement only", (value: ReaderPostPromotionAttestationV3) => reseal(value, {
      placement: "top", decision: "promote_top" })],
    ["placement and block", (value: ReaderPostPromotionAttestationV3) => reseal(value, {
      placement: "top", decision: "promote_top",
      comparator: { ...value.comparator, block: "ranked" } })],
  ] as const)("rejects an unranked post moved into Top (%s)", (_label, forge) => {
    const fixture = boardFixture([{ providerKey: "rss" }]);
    const card = fixture.props.content.newsWithoutRatingPosts[0]!;
    const props = withCards(fixture.props, {
      topReads: [{ ...card, promotionTier: "top", cardKind: "curated_top_read" }],
      newsWithoutRatingPosts: [] });

    expect(() => assertReaderSummaryPromotionAttestations(props,
      [forge(fixture.attestations[0]!)])).toThrow("Reader promotion attestation is invalid");
  });

  it("rejects a forged popularity even with a matching card signal", () => {
    const fixture = boardFixture(redditCohort);
    const quiet = fixture.attestations.at(-1)!;
    const forged = reseal(quiet, { comparator: { ...quiet.comparator,
      popularity: { cohortSize: 5, below: 3, equal: 1 } } });
    const cards = fixture.props.content.topReads;
    const props = withCards(fixture.props, { topReads: [...cards.slice(0, -1),
      { ...cards.at(-1)!, signalScore: 7 }] });

    expect(() => assertReaderSummaryPromotionAttestations(props,
      [...fixture.attestations.slice(0, -1), forged])).toThrow();
  });

  it("rejects Show more behind a Top that is not full", () => {
    const fixture = boardFixture([
      { providerKey: "reddit", value: 984 },
      { providerKey: "reddit", value: 0 },
    ]);
    const [lead, second] = fixture.props.content.topReads;
    const props = { ...fixture.props, content: { ...fixture.props.content,
      topReads: [lead!], selectedPosts: [{ ...second!, promotionTier: "additional" as const,
        cardKind: "additional_notable_story" as const }] } };

    expect(() => assertReaderSummaryPromotionAttestations(props, [
      fixture.attestations[0]!, reseal(fixture.attestations[1]!, { placement: "additional",
        decision: "promote_additional", slot: 1 }),
    ])).toThrow("Reader promotion placement cap is invalid");
  });

  it("rejects a card signal that differs from the signed percentile", () => {
    const fixture = boardFixture([{ providerKey: "reddit", value: 984 }]);
    const props = withCards(fixture.props, { topReads: [{
      ...fixture.props.content.topReads[0]!, signalScore: 9.9 }] });

    expect(() => assertReaderSummaryPromotionAttestations(props, fixture.attestations))
      .toThrow("Reader promotion attestation is invalid");
  });

  it("rejects more than twelve Top cards and more than sixteen news cards", () => {
    const fixture = boardFixture([{ providerKey: "rss" }]);
    const card = fixture.props.content.newsWithoutRatingPosts[0]!;
    const props = withCards(fixture.props, {
      newsWithoutRatingPosts: Array.from({ length: 17 }, () => card) });

    expect(() => assertReaderSummaryPromotionAttestations(props,
      Array.from({ length: 17 }, () => fixture.attestations[0]!)))
      .toThrow("Reader promotion placement cap is invalid");
  });

  it("rejects a card headline that differs from its seal", () => {
    const fixture = boardFixture([{ providerKey: "reddit", value: 5 }]);
    const card = fixture.props.content.topReads[0]!;
    const props = withCards(fixture.props, { topReads: [{ ...card,
      displayHeadline: { ...card.displayHeadline!,
        text: "Different supported headline" } as TopRead["displayHeadline"] }] });

    expect(() => assertReaderSummaryPromotionAttestations(props, fixture.attestations))
      .toThrow("Reader promotion attestation is invalid");
    expect(readerDisplayPublicationFindings(props, fixture.evidence))
      .toContainEqual(expect.objectContaining({ code: "editorial_quality" }));
  });

  it("rejects a resealed exact cutoff outside the source window", () => {
    const fixture = boardFixture([{ providerKey: "reddit", value: 5 }]);
    const forged = reseal(fixture.attestations[0]!, {
      ingestionCutoff: new Date("2099-01-01T00:00:00.123Z"),
      exactIngestionCutoff: "2099-01-01T00:00:00.123456Z" });

    expect(() => assertReaderSummaryPromotionAttestations(fixture.props, [forged]))
      .toThrow("Reader promotion attestation is invalid");
  });
});

type SlotSpec = {
  readonly providerKey: "reddit" | "rss";
  readonly value?: number;
};

const publishedAt = "2026-07-05T08:00:00.123456Z";
const matureObservedAt = "2026-07-05T15:00:00.000000Z";

/** Five mature Reddit posts: the smallest family with signed popularity. */
const redditCohort: readonly SlotSpec[] = [0, 984, 10, 20, 30]
  .map((value) => ({ providerKey: "reddit", value }));

const boardFixture = (specs: readonly SlotSpec[]) => {
  const base = dailySynthesisArtifact().toSnapshot();
  const source = dailyEvidenceSelection(25).selectedEvidence[0]!;
  const uuid = (n: number) =>
    `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
  const slots = specs.map((spec, index) => {
    const n = 256 + index * 8;
    return { ...spec, candidateId: uuid(n + 1), sourceItemId: uuid(n + 2),
      sourceBindingId: uuid(n + 3), interestId: uuid(n + 4),
      assessmentId: uuid(n + 5), canonicalUrl: `https://example.test/post-${index}`,
      storyId: `story-${index}` };
  });
  const leads = slots.map((slot) => acceptedFixtureReaderHeadline({ ...source,
    feedItemId: slot.candidateId, sourceItemId: slot.sourceItemId,
    sourceBindingId: slot.sourceBindingId, providerKey: slot.providerKey,
    canonicalUrl: slot.canonicalUrl, interestId: slot.interestId,
  }, { tenantId: base.tenantId, workspaceId: base.workspaceId }));
  const candidates = slots.map((slot, index): ReaderPostPromotionV3Candidate => {
    const lead = leads[index]!;
    if (lead.readerHeadline?.status !== "accepted") throw new Error("invalid fixture");
    const input = { tenantId: base.tenantId, workspaceId: base.workspaceId,
      interestId: lead.interestId, candidateId: slot.candidateId,
      sourceItemId: slot.sourceItemId, sourceBindingId: slot.sourceBindingId,
      providerKey: slot.providerKey, trustedIntent: lead.readerHeadline.binding.trustedIntent,
      sourceSnapshotSha256: "1".repeat(64), title: lead.title,
      body: lead.sourceText!, captureComplete: true };
    return {
      candidateId: slot.candidateId, providerKey: slot.providerKey,
      providerFamily: slot.providerKey, sourceItemId: slot.sourceItemId,
      canonicalIdentity: slot.canonicalUrl, storyId: slot.storyId, publishedAt,
      assessmentId: slot.assessmentId, assessedAt: "2026-07-05T08:30:00.123456Z",
      rubricVersion: "reader-value.v1", sourceSnapshotSha256: "1".repeat(64),
      inputSha256: "2".repeat(64), rubricSha256: "3".repeat(64),
      modelConfigVersion: "jev.v1", answers: answers(),
      usefulness: "useful", relevance: "central", title: lead.title,
      engagement: slot.value === undefined ? null : {
        method: "reddit_score", value: slot.value, observedAt: matureObservedAt },
      presentation: { status: "available",
        presentationInputDigest: readerPostPresentationV3InputDigest(input) },
      scopeValid: true, sourceIdentityValid: true, freshnessValid: true,
      safetyValid: true, citationValid: true, blocked: false,
    };
  });
  const promotionV3 = selectReaderPostPromotionsV3(candidates);
  const sourceWindow = { ...base.sourceWindow,
    exactIngestionCutoff: base.sourceWindow.ingestionCutoff?.toISOString()
      .replace(/\.(\d{3})Z$/u, ".$1000Z"),
    selectedFeedItemIds: slots.map((slot) => slot.candidateId),
    storyClusterIds: slots.map((slot) => slot.storyId) };
  const clusters = slots.map((slot, index) => ({ id: slot.storyId,
    storyKey: slot.storyId, rankingPolicyVersion: READER_PROMOTION_POLICY_STAMP,
    representativeFeedItemId: slot.candidateId, duplicateFeedItemIds: [],
    interestIds: [slot.interestId], providerKeys: [slot.providerKey], score: 0,
    observedAtRange: { startedAt: leads[index]!.observedAt,
      endedAt: leads[index]!.observedAt }, whyImportant: [] }));
  const citations = slots.map((slot, index) => ({
    citationId: `citation-${index}`, feedItemId: slot.candidateId,
    sourceItemId: slot.sourceItemId, providerKey: slot.providerKey,
    field: "bodyPreview" as const, canonicalUrl: leads[index]!.canonicalUrl }));
  const evidence = { rankingPolicyVersion: READER_PROMOTION_POLICY_STAMP,
    sourceWindow, clusters, selectedEvidence: leads, promotionV3 };
  const projection = buildReaderPostPromotionProjection({
    evidence: leads, clusters, sourceWindow, promotionV3, citations,
    attestationBinding: { artifactId: base.readerSummaryId, sourceWindow } });
  const attestations = projection.attestations as ReaderPostPromotionAttestationV3[];
  const props = { ...base, sourceWindow, storyClusters: clusters,
    citationMap: citations, promotionAttestations: attestations,
    promotionEvidenceFacts: [], content: { ...base.content!,
      topReads: projection.topReads, selectedPosts: projection.additionalPosts,
      newsWithoutRatingPosts: projection.newsPosts } };
  return { evidence, attestations, props };
};

type BoardProps = ReturnType<typeof boardFixture>["props"];

const withCards = (props: BoardProps, cards: {
  readonly topReads?: readonly TopRead[];
  readonly newsWithoutRatingPosts?: readonly TopRead[];
}): BoardProps => ({ ...props, content: { ...props.content, ...cards } });

const reseal = (
  attestation: ReaderPostPromotionAttestationV3,
  changes: Partial<ReaderPostPromotionAttestationV3>,
): ReaderPostPromotionAttestationV3 => {
  const { digest: ignoredDigest, canonicalPayload: ignoredPayload, ...body } =
    { ...attestation, ...changes };
  void ignoredDigest; void ignoredPayload;
  const canonicalPayload = canonicalPromotionPayload(body);
  return { ...body, canonicalPayload, digest: promotionPayloadDigest(canonicalPayload) };
};

const answers = (): ReaderValueAnswers => ({
  usefulness: answer("usefulness", "useful"),
  relevance: answer("relevance", "central"),
  context_sufficiency: answer("context_sufficiency", "sufficient"),
  evidence_basis: answer("evidence_basis", "observation"),
});
const labels = { usefulness: ["noise", "context", "useful", "important",
  "insufficient_context"], relevance: ["unrelated", "adjacent", "relevant",
  "central", "insufficient_context"], context_sufficiency: ["insufficient",
  "partial", "sufficient"], evidence_basis: ["observation", "described_data",
  "linked_claim", "unsupported_claim", "no_claim", "insufficient_context"] } as const;
const answer = <K extends ReaderValueCriterion>(criterion: K,
  choice: ReaderValueAnswers[K]["choice"]): ReaderValueAnswers[K] => ({
    choice, probabilities: Object.fromEntries((labels[criterion] as readonly string[])
      .map((value) => [value, value === choice ? 1 : 0])), confidence: 0.9,
    choiceDiffersFromArgmax: false, probabilityTie: false,
  }) as ReaderValueAnswers[K];
