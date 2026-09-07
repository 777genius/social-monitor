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

type Placement = "top" | "additional";
const fixture = (
  change: Change = (item) => item,
  placement: Placement = "top",
  omitSupport = false,
) => {
  const base = dailyEvidenceSelection(50);
  const evidence = base.selectedEvidence.map((item) => ({
    ...item,
    promotionFacts: {
      ...item.promotionFacts!, authorityAttestation: trust,
      freshnessProvenance: { ...item.promotionFacts!.freshnessProvenance!,
        exactIngestionCutoff: "2026-07-05T09:00:00.000000Z",
      },
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
  // Eight stronger, distinct stories fill Top through the real composer.
  // The target remains a representative and naturally overflows to Additional.
  const fillers = placement === "additional" ? Array.from({ length: 8 }, (_, index) => {
    const lead = evidence[1]!;
    return { ...lead, feedItemId: `filler-${index}`, sourceItemId: `source-filler-${index}`,
      canonicalUrl: `https://example.test/filler-${index}`,
      promotionFacts: { ...lead.promotionFacts!,
        canonicalIdentity: `story:filler-${index}`,
        metrics: { provider: "hacker_news" as const, points: 500 },
      },
    };
  }) : [];
  const clusters = [cluster, ...fillers.map((item) => storyCluster(item.feedItemId, [item]))];
  const selection = {
    ...base, editorialSlate: undefined,
    selectedEvidence: [...(omitSupport ? evidence.slice(1) : evidence), ...fillers],
    clusters,
    sourceWindow: { ...base.sourceWindow, storyClusterIds: clusters.map((item) => item.id) },
  };
  const slate = composeReaderSummaryEditorialSlate({ selection });
  assert.deepEqual(slate[placement].map((entry) => entry.candidateId), ["feed-publication-2"]);
  assert.deepEqual(slate.top.map((entry) => entry.candidateId), placement === "top"
    ? ["feed-publication-2"] : fillers.map((item) => item.feedItemId));
  assert.equal(slate.additional.length, placement === "additional" ? 1 : 0);
  const upstream = materializeReaderSummaryEditorialSlate({ selection, slate });
  const materialized = admitReaderPostPromotionEvidence(upstream);
  const citations = materialized.selectedEvidence.map((item, index) => ({
    citationId: `fixture-citation-${index}`, feedItemId: item.feedItemId,
    sourceItemId: item.sourceItemId, providerKey: item.providerKey,
    canonicalUrl: item.canonicalUrl, field: "canonicalUrl" as const,
  }));
  return {
    upstream, placement, evidence: materialized.selectedEvidence, clusters: materialized.clusters,
    citations, sourceWindow: materialized.sourceWindow, editorialSlate: slate,
  };
};

const assertParity = (params: ReturnType<typeof fixture>, retained: boolean) => {
  const actual = buildReaderPostPromotionProjection({ ...params,
    attestationBinding: { artifactId: "fixture-artifact", sourceWindow: params.sourceWindow },
  });
  const expected = readerSummaryPromotionPublicationOracle(params);
  const target = params.placement === "top" ? actual.topReads[0]! : actual.additionalPosts[0]!;
  const leadIds = params.editorialSlate.orderedCandidateIds;
  const evidenceIds = [...leadIds, ...(retained ? ["feed-publication-1"] : [])].sort();
  for (const materialized of [params.upstream, {
    selectedEvidence: params.evidence, clusters: params.clusters, sourceWindow: params.sourceWindow,
  }]) {
    assert.deepEqual(materialized.selectedEvidence.map((item) => item.feedItemId).sort(), evidenceIds);
    assert.deepEqual([...materialized.sourceWindow.selectedFeedItemIds].sort(), evidenceIds);
    const cluster = materialized.clusters.find((item) =>
      item.representativeFeedItemId === "feed-publication-2")!;
    assert.deepEqual(cluster.duplicateFeedItemIds, retained ? ["feed-publication-1"] : []);
    assert.deepEqual(cluster.providerKeys, retained ? ["hacker-news", "reddit"] : ["hacker-news"]);
  }
  for (const [cards, entries] of [[actual.topReads, expected.top],
    [actual.additionalPosts, expected.additional]] as const) {
    assert.deepEqual(cards.map((card) => ({
      candidateId: card.promotionCandidateId,
      canonicalIdentity: card.promotionCanonicalIdentity,
      placement: card.promotionTier, citationIds: card.citationIds,
    })), entries);
    for (const card of cards) assert.deepEqual(card.citationIds, [...card.citationIds].sort());
  }
  const targetIds = ["feed-publication-2", ...(retained ? ["feed-publication-1"] : [])];
  assert.deepEqual(target.citationIds, params.citations.filter((citation) =>
    targetIds.includes(citation.feedItemId)).map((citation) => citation.citationId).sort());
  assert.deepEqual(actual.attestedEvidenceFacts.map((item) => item.candidateId).sort(), evidenceIds);
  assert.equal(actual.attestations.length, leadIds.length);
  const attestation = actual.attestations.find((item) => item.candidateId === "feed-publication-2")!;
  assert.equal(attestation.placement, params.placement);
  assert.equal(attestation.providerCount, retained ? 2 : 1);
  assert.equal(attestation.confidence, target.confidence.score);
  assert.deepEqual(attestation.citationIds, target.citationIds);
  assert.deepEqual(attestation.supportFacts, actual.attestedEvidenceFacts.filter((item) =>
    item.candidateId === "feed-publication-1"));
  assert.deepEqual(attestation.supportFacts.map((item) => item.candidateId),
    retained ? ["feed-publication-1"] : []);
  if (retained) {
    const support = attestation.supportFacts[0]!;
    assert.deepEqual(support.authorityAttestation, trust);
    assert.equal(support.citationValid, true);
    assert.equal(support.safetyValid, true);
    assert.equal(support.freshnessValid, true);
  }
  assert.deepEqual(target.confirmedProviderKeys, retained ? ["hacker-news", "reddit"] : ["hacker-news"]);
  if (!retained) {
    const baselineParams = fixture(undefined, params.placement, true);
    const baseline = buildReaderPostPromotionProjection(baselineParams);
    assert.deepEqual(actual.topReads, baseline.topReads);
    assert.deepEqual(actual.additionalPosts, baseline.additionalPosts);
    assert.deepEqual(actual.attestedEvidenceFacts, baseline.attestedEvidenceFacts);
    assert.equal(target.confidence.score, 0.42);
  }
  assert.deepEqual(promotionPublicationFindings({
    actualTop: actual.topReads, actualSelected: actual.additionalPosts,
    expectedTop: expected.top, expectedAdditional: expected.additional,
    expectedPolicyVersion: "reader_post_promotion.v2",
  }), []);
};

const invalidSupport: readonly (readonly [string, Change])[] = [
  ["missing promotion facts", (item) => ({ ...item, promotionFacts: undefined })],
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

describe.each<Placement>(["top", "additional"])("V2 upstream %s support qualification", (placement) => {
  for (const [label, change] of invalidSupport) {
    it(`excludes ${label} before publication`, () => assertParity(fixture(change, placement), false));
  }
  it("retains qualified catalog support", () => assertParity(fixture(undefined, placement), true));
  it.each([
    ["minus one microsecond", "2026-07-05T08:59:59.999999Z", true],
    ["equal", "2026-07-05T09:00:00.000000Z", true],
    ["plus one microsecond", "2026-07-05T09:00:00.000001Z", false],
  ] as const)("observed at cutoff %s with matching exact cutoff provenance", (_label, observedAt, retained) => {
    const change: Change = (item) => ({ ...item, observedAt: new Date(observedAt),
      promotionFacts: { ...item.promotionFacts!,
        engagementAuthority: { observedAt: new Date(observedAt), regressionState: "stable" },
        freshnessProvenance: {
          status: "observed", publishedAt: item.publishedAt, observedAt: new Date(observedAt),
          ingestionCutoff: new Date("2026-07-05T09:00:00.000Z"),
          exactPublishedAt: "2026-07-05T08:00:00.000000Z",
          exactObservedAt: observedAt, exactIngestionCutoff: "2026-07-05T09:00:00.000000Z",
        },
      },
    });
    assertParity(fixture(change, placement), retained);
  });
  it("keeps the independent oracle rejecting missing support citations", () => {
    const params = fixture(undefined, placement);
    assertParity(params, true);
    const actual = buildReaderPostPromotionProjection(params);
    const expected = readerSummaryPromotionPublicationOracle(params);
    const supportCitationId = params.citations.find((citation) =>
      citation.feedItemId === "feed-publication-1")!.citationId;
    const removeSupport = (cards: typeof actual.topReads) => cards.map((card) => ({
      ...card, citationIds: card.citationIds.filter((id) => id !== supportCitationId),
    }));
    const findings = promotionPublicationFindings({
      actualTop: placement === "top" ? removeSupport(actual.topReads) : actual.topReads,
      actualSelected: placement === "additional" ? removeSupport(actual.additionalPosts) : actual.additionalPosts,
      expectedTop: expected.top, expectedAdditional: expected.additional,
      expectedPolicyVersion: "reader_post_promotion.v2",
    });
    assert(findings.some((finding) => finding.reason.includes(
      placement === "top" ? "Top array differs" : "Additional array differs",
    )));
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
