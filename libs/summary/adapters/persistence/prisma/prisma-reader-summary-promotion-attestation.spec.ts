import {
  buildReaderPostPromotionAttestations,
  canonicalPromotionPayload,
  promotionPayloadDigest,
  selectReaderPostPromotions,
} from "../../../domain";
import { normalizePromotionAttestations } from
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
      exactPublishedAt: "2026-08-14T00:00:00.000000Z",
      exactObservedAt: "2026-08-14T12:00:00.000000Z",
      exactIngestionCutoff: "2026-08-14T12:00:00.000000Z",
    });
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
  buildReaderPostPromotionAttestations(
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

const serializedSupportFixture = (): unknown[] => JSON.parse(JSON.stringify(
  buildReaderPostPromotionAttestations(
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
