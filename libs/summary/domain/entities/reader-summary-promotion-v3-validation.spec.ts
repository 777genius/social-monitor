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
import { buildReaderPostPromotionProjection } from
  "../services/reader-post-promotion-projection";
import { readerPostPresentationV3InputDigest } from
  "../services/reader-post-presentation-v3";
import { canonicalPromotionPayload, promotionPayloadDigest } from
  "../services/reader-post-promotion-attestation";
import { assertReaderSummaryPromotionAttestations } from
  "./reader-summary-promotion-attestation-validation";

describe("Promotion V3 artifact and publication headline binding", () => {
  it("accepts a valid nonempty V3 artifact and publication", () => {
    const fixture = v3Fixture();

    expect(() => assertReaderSummaryPromotionAttestations(
      fixture.props,
      fixture.projection.attestations,
    )).not.toThrow();
    expect(readerDisplayPublicationFindings(fixture.props, fixture.evidence))
      .toEqual([]);
  });

  // Regression: a malformed V3 projection cannot publish thirteen cards in a
  // global placement, even when the presentation and citation data are present.
  it.each(["top", "additional"] as const)(
    "rejects more than twelve %s V3 cards", (placement) => {
      const fixture = v3Fixture();
      const card = fixture.props.content!.topReads[0]!;
      const cards = Array.from({ length: 13 }, () => card);
      const props = { ...fixture.props, content: { ...fixture.props.content!,
        topReads: placement === "top" ? cards : [],
        selectedPosts: placement === "additional" ? cards : [] } };

      expect(() => assertReaderSummaryPromotionAttestations(
        props, Array.from({ length: 13 }, () => fixture.projection.attestations[0]!),
      )).toThrow("Reader summary Promotion V3 placement cap is invalid");
    });

  it("accepts a twelve-card top and additional lane", () => {
    const fixture = v3Fixture(24);

    expect(fixture.props.content!.topReads).toHaveLength(12);
    expect(fixture.props.content!.selectedPosts).toHaveLength(12);
    expect(() => assertReaderSummaryPromotionAttestations(
      fixture.props,
      fixture.projection.attestations,
    )).not.toThrow();
  });

  it("rejects a card headline that differs from its V3 seal", () => {
    const fixture = v3Fixture();
    const card = fixture.props.content!.topReads[0]!;
    const props = { ...fixture.props, content: { ...fixture.props.content!,
      topReads: [{ ...card, displayHeadline: { ...card.displayHeadline!,
        text: "Different supported headline" } }] } };

    expect(() => assertReaderSummaryPromotionAttestations(
      props,
      fixture.projection.attestations,
    )).toThrow("Reader summary Promotion V3 attestation is invalid");
    expect(readerDisplayPublicationFindings(props, fixture.evidence))
      .toContainEqual(expect.objectContaining({ code: "editorial_quality" }));
  });

  it("rejects a mismatched V3 captured-source seal", () => {
    const fixture = v3Fixture();
    const attestation = fixture.projection.attestations[0]!;
    if (attestation.schemaVersion !== "reader_post_promotion_attestation.v3") {
      throw new Error("invalid fixture");
    }
    const altered = { ...attestation, presentation: { ...attestation.presentation,
      displayHeadline: { ...attestation.presentation.displayHeadline,
        capturedSourceDigest: "0".repeat(64) } } };

    expect(() => assertReaderSummaryPromotionAttestations(
      fixture.props,
      [altered],
    )).toThrow("Reader summary Promotion V3 attestation is invalid");
  });

  it("rejects a publication attestation with a replaced provider identity", () => {
    const fixture = v3Fixture();
    const attestation = fixture.projection.attestations[0]!;
    if (attestation.schemaVersion !== "reader_post_promotion_attestation.v3") {
      throw new Error("invalid fixture");
    }

    expect(() => assertReaderSummaryPromotionAttestations(
      fixture.props,
      [{ ...attestation, provider: "github_radar" }],
    )).toThrow("Reader summary Promotion V3 attestation is invalid");
  });

  it("rejects a recomputed digest whose exact cutoff is outside the source window", () => {
    const fixture = v3Fixture();
    const attestation = fixture.projection.attestations[0]!;
    if (attestation.schemaVersion !== "reader_post_promotion_attestation.v3") {
      throw new Error("invalid fixture");
    }
    const { digest: ignoredDigest, canonicalPayload: ignoredPayload, ...original } =
      attestation;
    void ignoredDigest; void ignoredPayload;
    const body = { ...original,
      ingestionCutoff: new Date("2099-01-01T00:00:00.123Z"),
      exactIngestionCutoff: "2099-01-01T00:00:00.123456Z" };
    const canonicalPayload = canonicalPromotionPayload(body);
    const resealed = { ...body, canonicalPayload,
      digest: promotionPayloadDigest(canonicalPayload) };

    expect(() => assertReaderSummaryPromotionAttestations(
      fixture.props, [resealed],
    )).toThrow("Reader summary Promotion V3 attestation is invalid");
  });

  it("keeps card signalScore equal to the ordering tie-break score", () => {
    const fixture = v3Fixture(3, [4.2, 8.691, 1.5]);
    expect(() => assertReaderSummaryPromotionAttestations(
      fixture.props, fixture.projection.attestations,
    )).not.toThrow();
    expect(fixture.projection.topReads.map((read) => read.signalScore))
      .toEqual([8.691, 4.2, 1.5]);
  });
});

const v3Fixture = (candidateCount = 1,
  signalScores?: readonly number[]) => {
  const base = dailySynthesisArtifact().toSnapshot();
  const source = dailyEvidenceSelection(25).selectedEvidence[0]!;
  const uuid = (n: number) =>
    `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
  const slots = Array.from({ length: candidateCount }, (_, index) => {
    const n = 256 + index * 8;
    return { candidateId: uuid(n + 1), sourceItemId: uuid(n + 2),
      sourceBindingId: uuid(n + 3), interestId: uuid(n + 4),
      assessmentId: uuid(n + 5),
      canonicalUrl: `https://example.test/v3-${index}`,
      storyId: `story-v3-${index}` };
  });
  const evidenceLeads = slots.map((slot) => {
    const lead = acceptedFixtureReaderHeadline({ ...source,
      feedItemId: slot.candidateId, sourceItemId: slot.sourceItemId,
      sourceBindingId: slot.sourceBindingId, providerKey: "rss",
      canonicalUrl: slot.canonicalUrl, interestId: slot.interestId,
    }, { tenantId: base.tenantId, workspaceId: base.workspaceId });
    if (lead.readerHeadline?.status !== "accepted") {
      throw new Error("invalid accepted headline fixture");
    }
    return lead;
  });
  const candidates = slots.map((slot, index): ReaderPostPromotionV3Candidate => {
    const evidenceLead = evidenceLeads[index]!;
    const headline = evidenceLead.readerHeadline!;
    if (headline.status !== "accepted") {
      throw new Error("invalid accepted headline fixture");
    }
    const input = { tenantId: base.tenantId, workspaceId: base.workspaceId,
      interestId: evidenceLead.interestId, candidateId: slot.candidateId,
      sourceItemId: slot.sourceItemId, sourceBindingId: slot.sourceBindingId,
      providerKey: "rss",
      trustedIntent: headline.binding.trustedIntent,
      sourceSnapshotSha256: "1".repeat(64), title: evidenceLead.title,
      body: evidenceLead.sourceText!, captureComplete: true };
    return {
      candidateId: slot.candidateId, providerKey: "rss",
      providerFamily: "rss", sourceItemId: slot.sourceItemId,
      canonicalIdentity: slot.canonicalUrl, storyId: slot.storyId,
      publishedAt: "2026-07-05T08:00:00.123456Z",
      assessmentId: slot.assessmentId,
      assessedAt: "2026-07-05T08:30:00.123456Z",
      rubricVersion: "reader-value.v1", sourceSnapshotSha256: "1".repeat(64),
      inputSha256: "2".repeat(64), rubricSha256: "3".repeat(64),
      modelConfigVersion: "jev.v1", answers: answers(),
      signalScore: signalScores?.[index] ?? 0,
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
    storyKey: slot.storyId,
    rankingPolicyVersion: "reader_promotion_policy.v3",
    representativeFeedItemId: slot.candidateId, duplicateFeedItemIds: [],
    interestIds: [slot.interestId], providerKeys: ["rss"], score: 0,
    observedAtRange: { startedAt: evidenceLeads[index]!.observedAt,
      endedAt: evidenceLeads[index]!.observedAt }, whyImportant: [] }));
  const citations = slots.map((slot, index) => ({
    citationId: `citation-v3-${index}`, feedItemId: slot.candidateId,
    sourceItemId: slot.sourceItemId, providerKey: "rss",
    field: "bodyPreview" as const,
    canonicalUrl: evidenceLeads[index]!.canonicalUrl }));
  const evidence = { rankingPolicyVersion: "reader_promotion_policy.v3",
    sourceWindow, clusters, selectedEvidence: evidenceLeads, promotionV3 };
  const projection = buildReaderPostPromotionProjection({
    evidence: evidence.selectedEvidence,
    clusters: evidence.clusters,
    sourceWindow: evidence.sourceWindow,
    promotionV3: evidence.promotionV3,
    citations, attestationBinding: {
      artifactId: base.readerSummaryId, sourceWindow } });
  const props = { ...base, sourceWindow, storyClusters: clusters,
    citationMap: citations, promotionAttestations: projection.attestations,
    promotionEvidenceFacts: [], content: { ...base.content!,
      topReads: projection.topReads,
      selectedPosts: projection.additionalPosts } };
  return { evidence, projection, props };
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
