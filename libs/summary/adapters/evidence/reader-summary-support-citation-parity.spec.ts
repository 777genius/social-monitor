import { admitReaderPostPromotionEvidence } from "../../domain/services/reader-post-promotion-evidence-admission";
import { selection, storyCluster, xEvidence, redditEvidence, hackerNewsEvidence } from "./reader-summary-editorial-slate.spec-support";
import { strict as assert } from "node:assert";
import type { SummaryEvidenceItem } from "../../domain/value-objects/summary-evidence-item";
import { dailyEvidenceSelection } from "../../domain/policies/reader-summary-publication-evidence-test-fixtures";
import { composeReaderSummaryEditorialSlate, materializeReaderSummaryEditorialSlate } from "./reader-summary-editorial-slate";
import { buildReaderPostPromotionProjection } from "../../domain/services/reader-post-promotion-projection";
import { readerSummaryPromotionPublicationOracle } from "../../domain/policies/reader-summary-promotion-publication-oracle";
import { promotionPublicationFindings } from "../../domain/policies/reader-summary-promotion-publication-verification";

const trust = {
  status: "attested" as const, trusted: true, official: false,
  attestedBy: "source_catalog" as const,
};
type Change = (item: SummaryEvidenceItem) => SummaryEvidenceItem;
const facts = (overrides: Partial<NonNullable<SummaryEvidenceItem["promotionFacts"]>>): Change =>
  (item) => ({ ...item, promotionFacts: { ...item.promotionFacts!, ...overrides } });

const fixture = (change: Change = (item) => item) => {
  const base = dailyEvidenceSelection(50);
  const evidence = base.selectedEvidence.map((item) => ({
    ...item,
    promotionFacts: {
      ...item.promotionFacts!, authorityAttestation: trust,
      engagementAuthority: {
        observedAt: item.observedAt, regressionState: "stable" as const,
      },
    },
  }));
  evidence[0] = change(evidence[0]!) as typeof evidence[number];
  const cluster = {
    ...base.clusters[0]!, duplicateFeedItemIds: [evidence[1]!.feedItemId],
    providerKeys: ["reddit", "hacker-news"],
  };
  const selection = {
    ...base, editorialSlate: undefined, selectedEvidence: evidence,
    clusters: [cluster],
    sourceWindow: { ...base.sourceWindow, storyClusterIds: [cluster.id] },
  };
  const slate = composeReaderSummaryEditorialSlate({ selection });
  const materialized = admitReaderPostPromotionEvidence(
    materializeReaderSummaryEditorialSlate({ selection, slate }),
  );
  const citations = materialized.selectedEvidence.map((item, index) => ({
    citationId: `fixture-citation-${index}`, feedItemId: item.feedItemId,
    sourceItemId: item.sourceItemId, providerKey: item.providerKey,
    canonicalUrl: item.canonicalUrl, field: "canonicalUrl" as const,
  }));
  return {
    evidence: materialized.selectedEvidence, clusters: materialized.clusters,
    citations, sourceWindow: materialized.sourceWindow, editorialSlate: slate,
  };
};

const assertParity = (params: ReturnType<typeof fixture>, retained: boolean) => {
  const actual = buildReaderPostPromotionProjection({ ...params,
    attestationBinding: { artifactId: "fixture-artifact", sourceWindow: params.sourceWindow },
  });
  const expected = readerSummaryPromotionPublicationOracle(params);
  assert.deepEqual(params.editorialSlate.orderedCandidateIds, ["feed-publication-2"]);
  assert.deepEqual(params.clusters[0]!.duplicateFeedItemIds,
    retained ? ["feed-publication-1"] : []);
  assert.equal(params.evidence.length, retained ? 2 : 1);
  assert.deepEqual(actual.topReads[0]!.citationIds,
    retained ? ["fixture-citation-0", "fixture-citation-1"] : ["fixture-citation-0"]);
  assert.deepEqual(actual.topReads.map((card) => ({
    candidateId: card.promotionCandidateId,
    canonicalIdentity: card.promotionCanonicalIdentity,
    placement: card.promotionTier, citationIds: card.citationIds,
  })), expected.top);
  assert.equal(actual.attestedEvidenceFacts.length, retained ? 2 : 1);
  assert.equal(actual.topReads[0]!.confirmedProviderKeys.length, retained ? 2 : 1);
  if (!retained) assert.equal(actual.topReads[0]!.confidence.score, 0.42);
  assert.deepEqual(promotionPublicationFindings({
    actualTop: actual.topReads, actualSelected: actual.additionalPosts,
    expectedTop: expected.top, expectedAdditional: expected.additional,
    expectedPolicyVersion: "reader_post_promotion.v2",
  }), []);
};

const invalidSupport: readonly (readonly [string, Change])[] = [
  ["missing catalog authority", facts({ authorityAttestation: undefined })],
  ["untrusted catalog authority", facts({ authorityAttestation: { ...trust, trusted: false } })],
  ["producer claimed authority", facts({ authorityAttestation: {
    ...trust, attestedBy: "producer",
  } as unknown as typeof trust })],
  ["malformed official flag", facts({ authorityAttestation: {
    ...trust, official: "false",
  } as unknown as typeof trust })],
  ["unattested authority", facts({ authorityAttestation: {
    ...trust, status: "unattested",
  } as unknown as typeof trust })],
  ["missing metrics", facts({ metrics: undefined, metricsState: "missing" })],
  ["conflicting metrics", facts({ metrics: { provider: "hacker_news", points: 100 } })],
  ["low metrics", facts({ metrics: { provider: "reddit", score: 1 } })],
  ["invalid safety", facts({ safetyValid: false })],
  ["invalid freshness", facts({ freshnessValid: false })],
  ["invalid quality", (item) => ({ ...item, contentQuality: {
    ...item.contentQuality!, eligibleForTopRead: false,
  } })],
  ["unavailable source", (item) => ({
    ...item, title: "selected evidence", bodyPreview: "selected evidence", sourceText: undefined,
  })],
  ...["2026-07-05T08:59:59.999999Z", "2026-07-05T09:00:00.000001Z"].map(
    (cutoff): readonly [string, Change] => [`mismatched exact cutoff ${cutoff}`, (item) => ({
      ...item, promotionFacts: { ...item.promotionFacts!, freshnessProvenance: {
        status: "observed", publishedAt: item.publishedAt, observedAt: item.observedAt,
        ingestionCutoff: new Date("2026-07-05T09:00:00.000Z"),
        exactPublishedAt: "2026-07-05T08:00:00.000000Z",
        exactObservedAt: "2026-07-05T08:05:00.000000Z",
        exactIngestionCutoff: cutoff,
      } },
    })],
  ),
];

describe("V2 upstream support qualification", () => {
  for (const [label, change] of invalidSupport) {
    it(`excludes ${label} before publication`, () => assertParity(fixture(change), false));
  }
  it("retains qualified catalog support", () => assertParity(fixture(), true));
  it("keeps the independent oracle rejecting missing support citations", () => {
    const params = fixture();
    const actual = buildReaderPostPromotionProjection({ ...params,
    attestationBinding: { artifactId: "fixture-artifact", sourceWindow: params.sourceWindow },
  });
    const expected = readerSummaryPromotionPublicationOracle(params);
    const findings = promotionPublicationFindings({
      actualTop: actual.topReads.map((card) => ({ ...card, citationIds: ["fixture-citation-0"] })),
      actualSelected: actual.additionalPosts,
      expectedTop: expected.top, expectedAdditional: expected.additional,
      expectedPolicyVersion: "reader_post_promotion.v2",
    });
    assert(findings.some((finding) => finding.reason.includes("Top array differs")));
  });
});


describe("V2 support at editorial capacity", () => {
  it("preserves Top and Additional order and trusted support across permutations", () => {
    const leads = Array.from({ length: 9 }, (_, index) => [
      xEvidence(`x-${index}`, 500), hackerNewsEvidence(`hn-${index}`, 500),
    ]).flat();
    const groups = leads.map((lead) => [lead, facts({ authorityAttestation: trust })(
      redditEvidence(`support-${lead.feedItemId}`, 50),
    )]);
    const source = selection(groups.flat(), groups.map((items, index) =>
      storyCluster(`capacity-${index}`, items)));
    const slate = composeReaderSummaryEditorialSlate({ selection: source });
    assert.equal(slate.top.length, 8);
    assert.equal(slate.additional.length, 8);
    const outputs = [source, { ...source, selectedEvidence: [...source.selectedEvidence].reverse() }]
      .map((input) => {
        const materialized = admitReaderPostPromotionEvidence(materializeReaderSummaryEditorialSlate({
          selection: input, slate: composeReaderSummaryEditorialSlate({ selection: input }),
        }));
        const params = {
          evidence: materialized.selectedEvidence, clusters: materialized.clusters,
          sourceWindow: materialized.sourceWindow, editorialSlate: materialized.editorialSlate!,
          citations: materialized.selectedEvidence.map((item, index) => ({
            citationId: `c${index + 1}`, feedItemId: item.feedItemId,
            sourceItemId: item.sourceItemId, providerKey: item.providerKey,
            canonicalUrl: item.canonicalUrl, field: "canonicalUrl" as const,
          })),
          attestationBinding: { artifactId: "capacity-artifact", sourceWindow: materialized.sourceWindow },
        };
        const actual = buildReaderPostPromotionProjection(params);
        const expected = readerSummaryPromotionPublicationOracle(params);
        assert.equal(actual.attestations.length, 16);
        for (const [cards, entries] of [[actual.topReads, expected.top],
          [actual.additionalPosts, expected.additional]] as const) {
          assert.deepEqual(cards.map((card) => ({
            candidateId: card.promotionCandidateId,
            canonicalIdentity: card.promotionCanonicalIdentity,
            placement: card.promotionTier, citationIds: card.citationIds,
          })), entries);
          assert(cards.every((card) => card.citationIds.length === 2));
        }
        return { top: expected.top, additional: expected.additional };
      });
    assert.deepEqual(outputs[0], outputs[1]);
  });
});
