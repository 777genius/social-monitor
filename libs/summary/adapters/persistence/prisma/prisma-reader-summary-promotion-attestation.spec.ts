import {
  canonicalPromotionPayload,
  emptyReaderSummaryReliabilityReport,
  promotionPayloadDigest,
  selectReaderPostPromotions,
} from "../../../domain";
import { buildReaderPromotionV2TestAttestations } from
  "../../../domain/services/reader-post-promotion-attestation.spec-support";
import {
  normalizePersistedPromotionBoard,
  normalizePromotionAttestations,
} from
  "./prisma-reader-summary-promotion-attestation";

describe("normalizePromotionAttestations", () => {
  it("rehydrates immutable GitHub promotion observation windows", () => {
    const [attestation] = normalizePromotionAttestations(serializedFixture());

    expect(attestation?.publishedAt).toEqual(
      new Date("2026-08-14T00:00:00.000Z"),
    );
    expect(attestation?.metrics).toMatchObject({
      provider: "github_radar",
      windowStartedAt: new Date("2026-08-13T12:00:00.000Z"),
      windowEndedAt: new Date("2026-08-14T12:00:00.000Z"),
      starsDelta: 50,
      forksDelta: 0,
    });
    expect(attestation).toMatchObject({
      schemaVersion: "reader_post_promotion_attestation.v2",
      policyVersion: "reader_post_promotion.v2",
      digestVersion: "reader_post_promotion_digest.sha256.v2",
      placement: "top",
      slot: 1,
      storyClusterId: "promotion:repo:owner/name",
      exactPublishedAt: "2026-08-14T00:00:00.000000Z",
      exactObservedAt: "2026-08-14T12:00:00.000000Z",
      exactIngestionCutoff: "2026-08-14T12:00:00.000000Z",
    });
    expect(attestation?.evidenceLineage).toEqual({
      leadCandidateId: "github:repo",
      leadCitationId: "citation:github:repo",
      supportCandidateIds: [],
      supportCitationIds: [],
      citationIds: ["citation:github:repo"],
    });
  });

  it("accepts HN500 V2 score components after JSON object-key reordering", () => {
    const fixture = serializedHn500Fixture() as Record<string, unknown>[];
    const item = fixture[0]!;
    const score = item.scoreComponents as Record<string, unknown>;
    const canonicalPayload = item.canonicalPayload;
    const digest = item.digest;
    item.scoreComponents = Object.fromEntries(
      Object.entries(score).reverse(),
    );

    expect(normalizePromotionAttestations(fixture)).toHaveLength(1);
    expect(item.canonicalPayload).toBe(canonicalPayload);
    expect(item.digest).toBe(digest);
  });

  it.each([
    ["unknown version", (item: Record<string, unknown>) => {
      item.schemaVersion = "reader_post_promotion_attestation.v99";
    }],
    ["unknown policy", (item: Record<string, unknown>) => {
      item.policyVersion = "reader_post_promotion.v99";
    }],
    ["malformed digest", (item: Record<string, unknown>) => {
      item.digest = "not-a-sha256-digest";
    }],
    ["zero-based V2 slot", (item: Record<string, unknown>) => {
      item.slot = 0;
    }],
    ["missing score component", (item: Record<string, unknown>) => {
      delete (item.scoreComponents as Record<string, unknown>)
        .weightedFreshness;
    }],
    ["changed score component value", (item: Record<string, unknown>) => {
      (item.scoreComponents as Record<string, unknown>).engagementSalience = 0.5;
    }],
    ["extra evidence lineage field", (item: Record<string, unknown>) => {
      (item.evidenceLineage as Record<string, unknown>).providerPayload = {};
    }],
    ["placement conflicts with slate entry", (item: Record<string, unknown>) => {
      item.placement = "additional";
      item.tier = "additional";
      item.decision = "promote_additional";
    }],
    ["candidate digest identity drift", (item: Record<string, unknown>) => {
      const candidate = JSON.parse(
        item.candidateDigestInput as string,
      ) as Record<string, unknown>;
      candidate.candidateId = "github:forged";
      item.candidateDigestInput = JSON.stringify(candidate);
    }],
    ["tampered slate digest", (item: Record<string, unknown>) => {
      item.slateDigest = "0".repeat(64);
    }],
    ["re-digested slate order drift", (item: Record<string, unknown>) => {
      const slate = JSON.parse(
        item.slateDigestInput as string,
      ) as Record<string, unknown>;
      (slate.orderedCandidateIds as string[]).unshift("github:other");
      (slate.orderedCanonicalIdentities as string[]).unshift(
        "repo:other/name",
      );
      (slate.digestInputs as string[]).unshift("entry:other");
      item.slateDigestInput = JSON.stringify(slate);
      item.slateDigest = promotionPayloadDigest(item.slateDigestInput as string);
    }],
  ] as const)("rejects V2 %s", (_label, mutate) => {
    const fixture = serializedFixture() as Record<string, unknown>[];
    mutate(fixture[0]!);
    if (fixture[0]!.digest !== "not-a-sha256-digest") rehash(fixture[0]!);
    expect(() => normalizePromotionAttestations(fixture)).toThrow(
      /exact schema|Invalid promotion field/u,
    );
  });

  it.each([
    ["one microsecond before", "2026-08-14T11:59:59.999999Z", 1],
    ["exactly equal", "2026-08-14T12:00:00.000000Z", 1],
    ["one microsecond after", "2026-08-14T12:00:00.000001Z", 0],
  ] as const)("applies the artifact cutoff %s", (_label, observedAt, count) => {
    expect(serializedFixture(observedAt)).toHaveLength(count);
  });

  it("rejects malformed persisted GitHub window dates", () => {
    const fixture = serializedFixture() as Record<string, unknown>[];
    const metrics = fixture[0]?.metrics as Record<string, unknown>;
    metrics.windowStartedAt = "not-a-date";
    expect(() => normalizePromotionAttestations(fixture)).toThrow(
      "Invalid promotion field: windowStartedAt",
    );
  });

  it.each([
    ["top-level extra", (item: Record<string, unknown>) => { item.extra = true; }],
    ["top-level missing", (item: Record<string, unknown>) => { delete item.metricsState; }],
    ["nested metric extra", (item: Record<string, unknown>) => {
      (item.metrics as Record<string, unknown>).comments = 1;
    }],
    ["exact/display mismatch", (item: Record<string, unknown>) => {
      item.exactPublishedAt = "2026-08-14T00:00:01.000001Z";
    }],
    ["invalid exact calendar date", (item: Record<string, unknown>) => {
      item.exactPublishedAt = "2026-02-30T00:00:00.000000Z";
    }],
  ] as const)("rejects %s even before a recomputed digest can authorize it", (
    _label, mutate,
  ) => {
    const fixture = serializedFixture() as Record<string, unknown>[];
    const item = fixture[0]!;
    mutate(item);
    const body = { ...item };
    delete body.digest;
    delete body.canonicalPayload;
    item.canonicalPayload = canonicalPromotionPayload(body);
    item.digest = promotionPayloadDigest(String(item.canonicalPayload));
    expect(() => normalizePromotionAttestations(fixture)).toThrow(
      /exact schema|Invalid promotion field/u,
    );
  });

  it.each([
    ["usefulness missing", (item: Record<string, unknown>) => {
      delete (item.usefulnessComponents as Record<string, unknown>).total;
    }],
    ["usefulness extra", (item: Record<string, unknown>) => {
      (item.usefulnessComponents as Record<string, unknown>).boost = 1;
    }],
    ["support missing", (item: Record<string, unknown>) => {
      delete supportFact(item).whyImportant;
    }],
    ["support extra", (item: Record<string, unknown>) => {
      supportFact(item).unknown = true;
    }],
    ["support relation missing", (item: Record<string, unknown>) => {
      delete (supportFact(item).relation as Record<string, unknown>).approved;
    }],
    ["support authority extra", (item: Record<string, unknown>) => {
      (supportFact(item).authorityAttestation as Record<string, unknown>).issuer = "tenant";
    }],
    ["support metrics missing", (item: Record<string, unknown>) => {
      delete (supportFact(item).metrics as Record<string, unknown>).weightedScore;
    }],
    ["support whyImportant empty", (item: Record<string, unknown>) => {
      supportFact(item).whyImportant = "   ";
    }],
  ] as const)("rejects recomputed nested %s mutations", (_label, mutate) => {
    const fixture = serializedSupportFixture() as Record<string, unknown>[];
    mutate(fixture[0]!);
    rehash(fixture[0]!);
    expect(() => normalizePromotionAttestations(fixture)).toThrow(
      /exact schema|Invalid promotion field/u,
    );
  });

  it("maps a genuinely pre-promotion persisted board to unavailable", () => {
    const content = legacyContent();

    const normalized = normalizePersistedPromotionBoard({
      promotionAttestations: undefined,
      promotionEvidenceFacts: undefined,
      content,
    });

    expect(normalized).toMatchObject({
      promotionAttestations: [],
      promotionEvidenceFacts: [],
      promotionBoardState: "legacy_unavailable",
      content: {
        topReads: [expect.objectContaining({
          title: "Pre-promotion persisted card",
        })],
        selectedPosts: [expect.objectContaining({
          title: "Pre-promotion persisted card",
        })],
        interestSections: [{
          items: [expect.objectContaining({
            title: "Pre-promotion persisted card",
          })],
        }],
      },
    });
    expect(normalized.content).toMatchObject({
      headline: "Legacy persisted summary",
      bullets: ["The surrounding summary remains readable."],
    });
  });

  it("does not classify stripped modern promotion provenance as legacy", () => {
    const content = legacyContent();
    const modernCard = {
      ...content.topReads[0]!,
      promotionMarker: "reader_post_promotion" as const,
    };

    const normalized = normalizePersistedPromotionBoard({
      promotionAttestations: undefined,
      promotionEvidenceFacts: undefined,
      content: { ...content, topReads: [modernCard] },
    });

    expect(normalized.content?.topReads).toEqual([modernCard]);
    expect(normalized.promotionAttestations).toEqual([]);
  });
});

const legacyContent = () => ({
  headline: "Legacy persisted summary",
  oneLineTakeaway: "Legacy detail remains usable.",
  bullets: ["The surrounding summary remains readable."],
  mainTopics: ["compatibility"],
  qualityState: {
    status: "ready" as const,
    flags: [],
    warnings: [],
    isSingleSource: true,
  },
  interestSections: [{
    interestId: "compatibility",
    title: "Compatibility",
    insight: "Legacy evidence is withheld.",
    items: [legacyCard()],
    citationIds: ["citation-legacy"],
  }],
  sourceMix: [],
  topReads: [legacyCard()],
  selectedPosts: [legacyCard()],
  claimBoard: [],
  reliabilityReport: emptyReaderSummaryReliabilityReport(),
  trendDelta: {
    newSignals: [],
    growingSignals: [],
    repeatedSignals: [],
    fadingSignals: [],
  },
  risks: [],
  openQuestions: [],
  nextActions: [],
});

const legacyCard = () => ({
  title: "Pre-promotion persisted card",
  providerKey: "rss",
  providerName: "RSS",
  primaryActionKind: "read_source" as const,
  reason: "Persisted before promotion attestations existed.",
  matchedInterestIds: ["compatibility"],
  matchedRules: [],
  signalScore: 0.5,
  confidence: {
    level: "medium" as const,
    score: 0.5,
    rationale: "Legacy payload.",
  },
  confirmedProviderKeys: ["rss"],
  providerMetrics: [],
  whyImportant: ["Compatibility"],
  whyNow: "Historical persisted data.",
  citationIds: ["citation-legacy"],
});

const supportFact = (item: Record<string, unknown>): Record<string, unknown> =>
  (item.supportFacts as Record<string, unknown>[])[0]!;

const rehash = (item: Record<string, unknown>): void => {
  const body = { ...item };
  delete body.digest;
  delete body.canonicalPayload;
  item.canonicalPayload = canonicalPromotionPayload(body);
  item.digest = promotionPayloadDigest(String(item.canonicalPayload));
};

const serializedFixture = (
  exactObservedAt = "2026-08-14T12:00:00.000000Z",
): unknown[] => JSON.parse(JSON.stringify(
  buildReaderPromotionV2TestAttestations(
    selectReaderPostPromotions([{
      candidateId: "github:repo",
      provider: "github-repo-radar",
      contentKind: "repository",
      canonicalIdentity: "repo:owner/name",
      citationId: "citation:github:repo",
      publishedAt: new Date("2026-08-14T00:00:00.000Z"),
      observedAt: new Date("2026-08-14T12:00:00.000Z"),
      checkedAt: new Date("2026-08-14T12:00:00.000Z"),
      periodStart: new Date("2026-08-14T00:00:00.000Z"),
      periodEnd: new Date("2026-08-15T00:00:00.000Z"),
      ingestionCutoff: new Date("2026-08-14T12:00:00.000Z"),
      exactPublishedAt: "2026-08-14T00:00:00.000000Z",
      exactObservedAt,
      exactPeriodStart: "2026-08-14T00:00:00.000000Z",
      exactPeriodEnd: "2026-08-15T00:00:00.000000Z",
      exactIngestionCutoff: "2026-08-14T12:00:00.000000Z",
      freshnessValid: true,
      qualityScore: 0.8,
      relevanceScore: 0.8,
      integrityScore: 0.8,
      qualityValid: true,
      safetyValid: true,
      citationValid: true,
      metricsState: "observed",
      metrics: {
        provider: "github_radar",
        snapshotKind: "repository_growth",
        windowStartedAt: new Date("2026-08-13T12:00:00.000Z"),
        windowEndedAt: new Date("2026-08-14T12:00:00.000Z"),
        starsDelta: 50,
        forksDelta: 0,
      },
    }]),
    {
      artifactId: "artifact-1",
      sourceWindow: {
        windowId: "window-1",
        startedAt: new Date("2026-08-14T00:00:00.000Z"),
        endedAt: new Date("2026-08-14T12:00:00.000Z"),
        selectedFeedItemIds: ["github:repo"],
        storyClusterIds: ["cluster:github:repo"],
        periodStartedAt: new Date("2026-08-14T00:00:00.000Z"),
        periodEndedAt: new Date("2026-08-15T00:00:00.000Z"),
        ingestionCutoff: new Date("2026-08-14T12:00:00.000Z"),
      },
    },
  ),
));

const serializedHn500Fixture = (): unknown[] => JSON.parse(JSON.stringify(
  buildReaderPromotionV2TestAttestations(
    selectReaderPostPromotions([{
      candidateId: "hn:500",
      provider: "hacker-news",
      contentKind: "story",
      canonicalIdentity: "story:hn-500",
      citationId: "citation:hn:500",
      publishedAt: new Date("2026-08-14T00:00:00.000Z"),
      observedAt: new Date("2026-08-14T12:00:00.000Z"),
      periodStart: new Date("2026-08-14T00:00:00.000Z"),
      periodEnd: new Date("2026-08-15T00:00:00.000Z"),
      ingestionCutoff: new Date("2026-08-14T12:00:00.000Z"),
      freshnessValid: true,
      qualityScore: 0.8,
      relevanceScore: 0.8,
      integrityScore: 0.8,
      qualityValid: true,
      safetyValid: true,
      citationValid: true,
      metricsState: "observed",
      metrics: { provider: "hacker_news", points: 500 },
    }]),
    {
      artifactId: "artifact-hn-500",
      sourceWindow: {
        windowId: "window-hn-500",
        startedAt: new Date("2026-08-14T00:00:00.000Z"),
        endedAt: new Date("2026-08-14T12:00:00.000Z"),
        selectedFeedItemIds: ["hn:500"],
        storyClusterIds: ["promotion:story:hn-500"],
        periodStartedAt: new Date("2026-08-14T00:00:00.000Z"),
        periodEndedAt: new Date("2026-08-15T00:00:00.000Z"),
        ingestionCutoff: new Date("2026-08-14T12:00:00.000Z"),
      },
    },
  ),
));

const serializedSupportFixture = (): unknown[] => JSON.parse(JSON.stringify(
  buildReaderPromotionV2TestAttestations(
    selectReaderPostPromotions([{
      candidateId: "hn:lead",
      provider: "hacker-news",
      contentKind: "story",
      canonicalIdentity: "story:release",
      citationId: "citation:hn:lead",
      publishedAt: new Date("2026-08-14T00:00:00.000Z"),
      observedAt: new Date("2026-08-14T01:00:00.000Z"),
      periodStart: new Date("2026-08-14T00:00:00.000Z"),
      periodEnd: new Date("2026-08-15T00:00:00.000Z"),
      ingestionCutoff: new Date("2026-08-14T12:00:00.000Z"),
      freshnessValid: true,
      qualityScore: 0.8,
      relevanceScore: 0.8,
      integrityScore: 0.8,
      qualityValid: true,
      safetyValid: true,
      citationValid: true,
      metricsState: "observed",
      metrics: { provider: "hacker_news", points: 50 },
      whyImportant: "Lead story",
    }, {
      candidateId: "x:support",
      provider: "x-twitter",
      contentKind: "original_post",
      canonicalIdentity: "story:official-release",
      citationId: "citation:x:support",
      publishedAt: new Date("2026-08-14T00:30:00.000Z"),
      observedAt: new Date("2026-08-14T01:00:00.000Z"),
      periodStart: new Date("2026-08-14T00:00:00.000Z"),
      periodEnd: new Date("2026-08-15T00:00:00.000Z"),
      ingestionCutoff: new Date("2026-08-14T12:00:00.000Z"),
      freshnessValid: true,
      qualityScore: 0.8,
      relevanceScore: 0.8,
      integrityScore: 0.8,
      qualityValid: true,
      safetyValid: true,
      citationValid: true,
      authorityAttestation: {
        status: "attested",
        official: true,
        trusted: true,
        attestedBy: "source_catalog",
      },
      metricsState: "observed",
      metrics: { provider: "x", likes: 15, reposts: 10, weightedScore: 35 },
      relation: {
        kind: "same_story",
        targetCanonicalIdentity: "story:release",
        confidence: 0.92,
        approved: true,
      },
      whyImportant: "Official confirmation",
    }]),
    {
      artifactId: "artifact-support",
      sourceWindow: {
        windowId: "window-support",
        startedAt: new Date("2026-08-14T00:00:00.000Z"),
        endedAt: new Date("2026-08-14T12:00:00.000Z"),
        selectedFeedItemIds: ["hn:lead", "x:support"],
        storyClusterIds: ["cluster:release"],
        periodStartedAt: new Date("2026-08-14T00:00:00.000Z"),
        periodEndedAt: new Date("2026-08-15T00:00:00.000Z"),
        ingestionCutoff: new Date("2026-08-14T12:00:00.000Z"),
      },
    },
  ),
));
