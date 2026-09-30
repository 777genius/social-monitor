import type { ReaderValueAnswers, ReaderValueCriterion } from
  "@social-monitor/relevance/domain/reader-value/reader-value-assessment";

import { acceptedFixtureReaderHeadline } from "../../test-fixtures/accepted-reader-headline";
import { dailyEvidenceSelection, dailySynthesisArtifact } from
  "../../domain/policies/reader-summary-publication-policy-test-fixtures";
import { ReaderSummaryArtifact } from "../../domain/entities/reader-summary-artifact";
import { presentReaderSummaryArtifact } from
  "../../features/shared/reader-summary-artifact-presenter";
import { readerSummaryArtifactViewFromReaderSummaryView } from
  "./reader-summary-rest.mapper";
import type { ReaderPostPromotionV3Candidate } from
  "../../domain/policies/reader-post-promotion-v3";
import { promotionPayloadDigest } from
  "../../domain/services/reader-post-promotion-attestation";
import { buildReaderPostPromotionProjection } from
  "../../domain/services/reader-post-promotion-projection";
import { assertV3PromotionAttestation } from
  "../../adapters/persistence/prisma/prisma-reader-summary-promotion-v3-schema";

describe("Promotion V3 public canonical identity", () => {
  it.each([
    ["direct", "https://example.test/article?edition=2&access_token=synthetic-marker-only",
      "https://example.test/article?edition=2"],
    ["whitespace", "  https://example.test/article?edition=2&access_token=synthetic-marker-only",
      "https://example.test/article?edition=2"],
    ["Google redirect", `  https://www.google.com/url?q=${encodeURIComponent(
      "https://example.test/article?edition=2&access_token=synthetic-marker-only")}&sa=U`,
    `https://www.google.com/url?q=${encodeURIComponent(
      "https://example.test/article?edition=2")}&sa=U`],
    ["scheme without slashes", "https:example.test/article?edition=2&access_token=synthetic-marker-only",
      "https://example.test/article?edition=2"],
    ["tab in scheme", "hTTps:\t//example.test/article?edition=2&access_token=synthetic-marker-only",
      "https://example.test/article?edition=2"],
    ["leading NUL before Google redirect", `\u0000https://www.google.com/url?q=${encodeURIComponent(
      "https://example.test/article?edition=2&access_token=synthetic-marker-only")}&sa=U`,
    `https://www.google.com/url?q=${encodeURIComponent(
      "https://example.test/article?edition=2")}&sa=U`],
    ["Google trailing DNS dot", `https://www.google.com./url?q=${encodeURIComponent(
      "https://example.test/article?edition=2&access_token=synthetic-marker-only")}&sa=U`,
    `https://www.google.com./url?q=${encodeURIComponent(
      "https://example.test/article?edition=2")}&sa=U`],
    ["encoded Google path", `https://www.google.com./%75rl?q=${encodeURIComponent(
      "https://example.test/article?edition=2&access_token=synthetic-marker-only")}&sa=U`,
    `https://www.google.com./%75rl?q=${encodeURIComponent(
      "https://example.test/article?edition=2")}&sa=U`],
    ["Facebook redirect", `https://l.facebook.com/l.php?u=${encodeURIComponent(
      "https://example.test/article?edition=2&access_token=synthetic-marker-only")}&lang=en`,
    `https://l.facebook.com/l.php?u=${encodeURIComponent(
      "https://example.test/article?edition=2")}&lang=en`],
    ["LinkedIn redirect", `https://www.linkedin.com/redir/redirect?url=${encodeURIComponent(
      "https://example.test/article?edition=2&access_token=synthetic-marker-only")}&lang=en`,
    `https://www.linkedin.com/redir/redirect?url=${encodeURIComponent(
      "https://example.test/article?edition=2")}&lang=en`],
    ["unrecognized redirect", `https://redirect.example.test/go?next=${encodeURIComponent(
      "https://example.test/article?edition=2&access_token=synthetic-marker-only")}&lang=en`,
    `https://redirect.example.test/go?next=${encodeURIComponent(
      "https://example.test/article?edition=2")}&lang=en`],
    ["empty query name", "https://example.test/?=https%3A%2F%2Fexample.test%2F%3Faccess_token%3Dsynthetic-marker-only",
      "https://example.test/?=https%3A%2F%2Fexample.test%2F"],
    ["scheme-relative value", "https://example.test/article?next=%2F%2Fuser%3Asynthetic-marker-only%40elsewhere.test%2F",
      "https://example.test/article?next=%2F%2Felsewhere.test%2F"],
    ["doubly encoded scheme-relative value",
      "https://example.test/?next=%252F%252Fuser%253Asynthetic-marker-only%2540elsewhere.test%252F",
      "https://example.test/"],
    ["encoded scheme-relative query name",
      "https://example.test/?%2F%2Fuser%3Asynthetic-marker-only%40elsewhere.test%2F=x",
      "https://example.test/"],
    ["encoded scheme-relative fragment",
      "https://example.test/#%2F%2Fuser%3Asynthetic-marker-only%40elsewhere.test%2F",
      "https://example.test/"],
  ])("signs a safe %s URL and serializes public evidence", (_case, rawIdentity,
    publicIdentity) => {
    const marker = "synthetic-marker-only";
    const base = dailySynthesisArtifact().toSnapshot();
    const source = dailyEvidenceSelection(25).selectedEvidence[0]!;
    const lead = acceptedFixtureReaderHeadline({ ...source,
      feedItemId: "00000000-0000-4000-8000-000000000005",
      canonicalUrl: publicIdentity,
    }, { tenantId: base.tenantId, workspaceId: base.workspaceId });
    const candidate: ReaderPostPromotionV3Candidate = {
      candidateId: lead.feedItemId,
      providerKey: lead.providerKey,
      providerFamily: "reddit",
      sourceItemId: lead.sourceItemId,
      canonicalIdentity: rawIdentity,
      storyId: "story-public",
      publishedAt: "2026-07-05T08:30:00.000000Z",
      assessmentId: "assessment-test",
      assessedAt: "2026-07-05T08:40:00.000000Z",
      rubricVersion: "reader-value.v1",
      sourceSnapshotSha256: "1".repeat(64),
      inputSha256: "2".repeat(64),
      rubricSha256: "3".repeat(64),
      modelConfigVersion: "model.v1",
      answers: answers(),
      presentation: { status: "available", presentationInputDigest: "4".repeat(64) },
      scopeValid: true, sourceIdentityValid: true, freshnessValid: true,
      safetyValid: true, citationValid: true, blocked: false,
    };
    const sourceWindow = {
      windowId: "window-test",
      startedAt: new Date("2026-07-05T08:00:00Z"),
      endedAt: new Date("2026-07-05T09:00:00Z"),
      selectedFeedItemIds: [lead.feedItemId], storyClusterIds: [candidate.storyId],
      periodStartedAt: new Date("2026-07-05T00:00:00Z"),
      periodEndedAt: new Date("2026-07-06T00:00:00Z"),
      ingestionCutoff: new Date("2026-07-05T09:00:00Z"),
      exactIngestionCutoff: "2026-07-05T09:00:00.000000Z",
    };
    const projection = buildReaderPostPromotionProjection({
      evidence: [lead], clusters: [], sourceWindow,
      citations: [{ citationId: "citation-test", feedItemId: lead.feedItemId,
        sourceItemId: lead.sourceItemId, providerKey: lead.providerKey,
        field: "canonicalUrl", canonicalUrl: publicIdentity }],
      promotionV3: { policyVersion: "reader_promotion_policy.v3", outcome: "ready",
        top: [candidate], additional: [], excluded: [] },
      attestationBinding: { artifactId: base.readerSummaryId, sourceWindow },
    });
    const card = projection.topReads[0]!;
    const attestation = projection.attestations[0]!;

    expect(candidate.canonicalIdentity).toBe(rawIdentity);
    expect(card.promotionCanonicalIdentity).toBe(publicIdentity);
    expect(attestation.canonicalIdentity).toBe(publicIdentity);
    expect(promotionPayloadDigest(attestation.canonicalPayload)).toBe(attestation.digest);
    assertV3PromotionAttestation(JSON.parse(JSON.stringify(attestation)), 0);
    expect(JSON.stringify({ cards: projection.topReads,
      citations: projection.admittedCitations, attestations: projection.attestations }))
      .not.toContain(marker);

    const artifact = ReaderSummaryArtifact.create({ ...base,
      sourceWindow, storyClusters: projection.admittedClusters,
      citationMap: projection.admittedCitations,
      topStories: [{ ...base.topStories[0]!, storyClusterId: candidate.storyId,
        citationIds: card.citationIds }],
      content: { ...base.content!, topReads: projection.topReads,
        selectedPosts: projection.additionalPosts, narrativeSections: [],
        interestSections: [] },
      promotionAttestations: projection.attestations,
      promotionEvidenceFacts: projection.attestedEvidenceFacts,
    });
    const view = presentReaderSummaryArtifact(artifact, { status: "fresh",
      checkedAt: new Date("2026-07-05T09:00:00Z") });
    const response = readerSummaryArtifactViewFromReaderSummaryView(view);
    expect(response).toBeDefined();
    expect(JSON.stringify(response)).not.toContain(marker);
  });
});

const answer = <K extends ReaderValueCriterion>(criterion: K,
  choice: ReaderValueAnswers[K]["choice"], choices: readonly string[]): ReaderValueAnswers[K] => ({
    choice,
    probabilities: Object.fromEntries(choices.map((value) =>
      [value, value === choice ? 1 : 0])),
    confidence: 0.9, choiceDiffersFromArgmax: false, probabilityTie: false,
  }) as ReaderValueAnswers[K];

const answers = (): ReaderValueAnswers => ({
  usefulness: answer("usefulness", "useful", ["noise", "context", "useful", "important",
    "insufficient_context"]),
  relevance: answer("relevance", "central", ["unrelated", "adjacent", "relevant",
    "central", "insufficient_context"]),
  context_sufficiency: answer("context_sufficiency", "sufficient", ["insufficient",
    "partial", "sufficient"]),
  evidence_basis: answer("evidence_basis", "observation", ["observation", "described_data",
    "linked_claim", "unsupported_claim", "no_claim", "insufficient_context"]),
});
