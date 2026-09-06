import type {
  StoryCluster,
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
} from "../../domain";
import { buildReaderPostPromotionProjection } from "../../domain";
import { buildReaderPostPromotionTitle, hasReaderFacingPromotionTitle } from
  "../../domain/services/reader-post-promotion-title";
import { readerSummaryPromotionV2Candidate } from
  "./reader-summary-editorial-candidate";
import {
  composeReaderSummaryEditorialSlate,
  materializeReaderSummaryEditorialSlate,
} from "./reader-summary-editorial-slate";

const periodStartedAt = new Date("2026-08-29T00:00:00.000Z");
const periodEndedAt = new Date("2026-08-30T00:00:00.000Z");
const publishedAt = new Date("2026-08-29T12:00:00.000Z");
const observedAt = new Date("2026-08-29T13:00:00.000Z");

describe("Reader Promotion V2 editorial slate", () => {
  describe.each(["full", "truncated"])("contextual negation with %s X titles", (kind) => {
    const context = "Atlas documents agent safety findings across public websites and proposes reporting standards for misalignment incidents and model properties.";
    const withBody = (body: string): SummaryEvidenceItem => ({
      ...xEvidence("negated-source", 3230),
      title: kind === "full" ? body : `X post by @lab: ${body.slice(0, 100)}...`,
      bodyPreview: body,
      whyImportant: [],
    });

    it.each([
      "Neither assertion about automatic agent writes across public websites and bypassing required human approval reflects actual product behavior. Atlas enables automatic agent writes. Atlas bypasses human approval.",
      `${context} Atlas enables automatic agent writes. Atlas bypasses human approval. Neither assertion is true.`,
    ])("excludes 3230 before ranking against 89: %s", (body) => {
      const higher = withBody(body);
      const lower = xEvidence("short-source", 89);
      const slate = compose([lower, higher]);
      expect(slate.orderedCandidateIds).toEqual(["short-source"]);
      expect(readerSummaryPromotionV2Candidate(higher, selection([higher], []))
        ?.admission.qualityFloorMet).toBe(false);
      expect(buildReaderPostPromotionTitle({ lead: higher }))
        .toBe("Current AI product discussion");
      expect(compose([higher, lower])).toEqual(slate);
    });

    it("keeps a self-contained negative candidate eligible for popularity ranking", () => {
      const claim = "Atlas enables neither automatic writes nor approval bypasses";
      const higher = withBody(`${context} ${claim}.`);
      expect(buildReaderPostPromotionTitle({ lead: higher })).toBe(claim);
      expect(compose([xEvidence("short-source", 89), higher]).orderedCandidateIds)
        .toEqual(["negated-source", "short-source"]);
    });
  });

  it.each(["full", "truncated"])(
    "rejects a qualified viral claim with a %s title before popularity ranking",
    (titleKind) => {
      const body = "The following claim about automatic agent writes on public websites is false and must not be treated as an announcement of actual product behavior. Atlas enables automatic agent writes.";
      const higher = {
        ...xEvidence("qualified-source", 3230),
        title: titleKind === "full" ? body : `${body.slice(0, 100)}...`,
        bodyPreview: body,
        whyImportant: [],
      };
      const lower = xEvidence("short-source", 89);
      expect(hasReaderFacingPromotionTitle(higher)).toBe(false);
      expect(compose([lower, higher]).orderedCandidateIds).toEqual(["short-source"]);
    },
  );

  it.each(["full", "truncated"])(
    "admits a long substantive source with a %s title and lets its popularity compete",
    (titleKind) => {
    const body = "How the research team evaluates agent incidents across public websites: the team proposes reporting standards that distinguish real-world incidents from model properties. Historically, the research team communicated agent misalignment primarily through research publications and detailed system cards. Agent misalignment now causes new types of real-world impact.";
    const higher = {
      ...xEvidence("long-source", 3230),
      title: titleKind === "full"
        ? body
        : `X post by @researchlab: ${body.slice(0, 130)}...`,
      bodyPreview: body,
    };
    const lower = xEvidence("short-source", 89);
    const source = selection([lower, higher], []);
    const candidate = readerSummaryPromotionV2Candidate(higher, source);

    expect(buildReaderPostPromotionTitle({ lead: higher })).toBe(
      "Agent misalignment now causes new types of real-world impact",
    );
    expect(hasReaderFacingPromotionTitle(higher)).toBe(true);
    expect(candidate?.admission.qualityFloorMet).toBe(true);
    expect(candidate?.engagement).toMatchObject({
      authoritative: true,
      authority: { source: "durable_projection", regressionState: "stable" },
    });
    expect(compose([lower, higher]).top.map((entry) => entry.candidateId))
      .toEqual(["long-source", "short-source"]);
    expect(compose([higher, lower])).toEqual(compose([lower, higher]));

    const reducedPopularity = {
      ...higher,
      promotionFacts: xEvidence("long-source", 70).promotionFacts,
    };
    expect(compose([lower, reducedPopularity]).top.map((entry) => entry.candidateId))
      .toEqual(["short-source", "long-source"]);

    for (const facts of [
      { ...higher.promotionFacts!, contentKind: "reply" as const },
      { ...higher.promotionFacts!, safetyValid: false },
      { ...higher.promotionFacts!, engagementAuthority: undefined },
      { ...higher.promotionFacts!, freshnessValid: false },
    ]) {
      expect(compose([{ ...higher, promotionFacts: facts }]).orderedCandidateIds)
        .toEqual([]);
    }
  });

  it("ranks X 11,112 above X 89 when both otherwise qualify", () => {
    const lower = xEvidence("x-89", 89);
    const higher = xEvidence("x-11112", 11_112);

    const slate = compose([lower, higher]);

    expect(slate.orderedCandidateIds).toEqual(["x-11112", "x-89"]);
  });

  it("keeps an Additional-floor candidate out of Top", () => {
    const additionalOnly = xEvidence("x-additional-floor", 35);
    const slate = compose([additionalOnly]);

    expect(slate.top).toEqual([]);
    expect(slate.additional).toEqual([
      expect.objectContaining({
        candidateId: "x-additional-floor",
        placement: "additional",
        reasonCodes: expect.arrayContaining(["top_floor_not_met"]),
      }),
    ]);
  });

  it("moves Top overflow into Additional without admitting junk", () => {
    const items = Array.from({ length: 9 }, (_, index) =>
      xEvidence(`x-${index + 1}`, 1_000 - index));

    const slate = compose(items);

    expect(slate.top).toHaveLength(8);
    expect(slate.additional.map((entry) => entry.candidateId)).toEqual([
      "x-9",
    ]);
    expect(slate.additional[0]?.reasonCodes).toContain(
      "top_capacity_overflow",
    );
    expect(slate.top.every((entry) =>
      entry.candidateId !== "x-9",
    )).toBe(true);
  });

  it("rejects a viral irrelevant candidate instead of filling a slot", () => {
    const viral = xEvidence("viral-irrelevant", 9_999_999, {
      relevanceScore: 0.49,
    });

    const slate = compose([viral]);

    expect(slate.top).toEqual([]);
    expect(slate.additional).toEqual([]);
    expect(slate.excluded).toContainEqual(expect.objectContaining({
      candidateId: "viral-irrelevant",
      reasonCodes: expect.arrayContaining(["relevance_floor_not_met"]),
    }));
  });

  it("keeps a deterministic empty slate when no candidate reaches admission", () => {
    const belowAdmission = xEvidence("x-no-signal", 34);

    const first = compose([belowAdmission]);
    const replay = compose([belowAdmission]);

    expect(first.top).toEqual([]);
    expect(first.additional).toEqual([]);
    expect(first.digestMaterial).toBe(replay.digestMaterial);
    expect(first.excluded).toContainEqual(expect.objectContaining({
      candidateId: "x-no-signal",
      reasonCodes: ["provider_floor_not_met"],
    }));
  });

  it("does not allow semantic duplicates to occupy two slots", () => {
    const higher = xEvidence("same-story-x", 500, {
      canonicalIdentity: "story:same",
    });
    const lower = redditEvidence("same-story-reddit", 80, {
      canonicalIdentity: "story:same",
    });
    const cluster = storyCluster("same-story", [
      higher,
      lower,
    ]);

    const slate = compose([higher, lower], [cluster]);

    expect(slate.orderedCanonicalIdentities).toEqual(["story:same"]);
    expect(slate.excluded).toContainEqual(expect.objectContaining({
      candidateId: "same-story-reddit",
      reasonCodes: ["semantic_story_duplicate"],
    }));
  });

  it("keeps the existing Top provider cap and diversity", () => {
    const xItems = Array.from({ length: 8 }, (_, index) =>
      xEvidence(`x-cap-${index + 1}`, 10_000 - index));
    const redditItems = Array.from({ length: 4 }, (_, index) =>
      redditEvidence(`reddit-cap-${index + 1}`, 500 - index));
    const hackerNewsItems = Array.from({ length: 4 }, (_, index) =>
      hackerNewsEvidence(`hn-cap-${index + 1}`, 400 - index));

    const slate = compose([...xItems, ...redditItems, ...hackerNewsItems]);
    const providerCounts = new Map<string, number>();
    for (const entry of slate.top) {
      providerCounts.set(
        entry.provider,
        (providerCounts.get(entry.provider) ?? 0) + 1,
      );
    }

    expect(slate.top).toHaveLength(8);
    expect(providerCounts.get("x")).toBeLessThanOrEqual(4);
    expect(providerCounts.get("reddit")).toBeGreaterThan(0);
    expect(providerCounts.get("hacker_news")).toBeGreaterThan(0);
    expect(slate.additional.some((entry) =>
      entry.reasonCodes.includes("top_provider_cap_overflow"),
    )).toBe(true);
  });

  it("produces byte-identical ordered identities and digest material", () => {
    const items = [
      redditEvidence("digest-reddit", 64),
      xEvidence("digest-x", 89),
      hackerNewsEvidence("digest-hn", 73),
    ];

    const forward = compose(items);
    const reverse = compose([...items].reverse());

    expect(JSON.stringify(reverse)).toBe(JSON.stringify(forward));
    expect(reverse.digestMaterial).toBe(forward.digestMaterial);
    expect(JSON.parse(forward.digestMaterial)).toMatchObject({
      sourceWindow: { windowId: "window-1" },
    });
    expect(Object.isFrozen(forward)).toBe(true);
    expect(Object.isFrozen(forward.top)).toBe(true);
    expect(Object.isFrozen(forward.top[0])).toBe(true);
  });

  it("materializes frontend card arrays in backend slate order", () => {
    const items = Array.from({ length: 9 }, (_, index) =>
      xEvidence(`card-${index + 1}`, 1_000 - index));
    const source = selection(
      items,
      items.map((item) => storyCluster(item.feedItemId, [item])),
    );
    const slate = composeReaderSummaryEditorialSlate({
      selection: source,
      candidates: items,
    });
    const materialized = materializeReaderSummaryEditorialSlate({
      selection: source,
      slate,
    });
    const projection = buildReaderPostPromotionProjection({
      evidence: materialized.selectedEvidence,
      clusters: materialized.clusters,
      sourceWindow: materialized.sourceWindow,
      editorialSlate: slate,
      citations: materialized.selectedEvidence.map((item, index) => ({
        citationId: `c${index + 1}`,
        feedItemId: item.feedItemId,
        sourceItemId: item.sourceItemId,
        providerKey: item.providerKey,
        field: "title",
        canonicalUrl: item.canonicalUrl,
      })),
    });

    expect(projection.topReads.map((item) =>
      item.promotionCandidateId)).toEqual(
      slate.top.map((entry) => entry.candidateId),
    );
    expect(projection.additionalPosts.map((item) =>
      item.promotionCandidateId)).toEqual(
      slate.additional.map((entry) => entry.candidateId),
    );
    expect(projection.topReads.map((item) => item.editorialSlot)).toEqual(
      slate.top.map((entry) => entry.slot),
    );
    expect(projection.topReads.every((item) =>
      item.editorialPolicyVersion === "reader_promotion_policy.v2",
    )).toBe(true);
  });

  it.each([
    ["missing metrics", {
      metricsState: "missing" as const,
      metrics: undefined,
    }],
    ["malformed metrics", {
      metricsState: "malformed" as const,
      metrics: { provider: "reddit" as const, score: -1 },
    }],
    ["stale authority", {
      engagementAuthority: {
        observedAt: new Date("2026-08-29T12:00:00.000Z"),
        regressionState: "stable" as const,
      },
    }],
    ["unresolved regression", {
      engagementAuthority: {
        observedAt: new Date("2026-08-29T23:00:00.000Z"),
        regressionState: "unresolved_regression" as const,
      },
    }],
    ["low engagement", {
      metrics: { provider: "reddit" as const, score: 1 },
    }],
  ] as const)("does not rematerialize %s support", (_label, overrides) => {
    const lead = xEvidence("support-lead", 500);
    const support = redditEvidence("support-peer", 100);
    const supportWithInvalidFacts: SummaryEvidenceItem = {
      ...support,
      promotionFacts: {
        ...support.promotionFacts!,
        ...overrides,
      },
    };
    const source = selection(
      [lead, supportWithInvalidFacts],
      [storyCluster("support-story", [lead, supportWithInvalidFacts])],
    );
    const slate = composeReaderSummaryEditorialSlate({
      selection: source,
      candidates: [lead, supportWithInvalidFacts],
    });
    const materialized = materializeReaderSummaryEditorialSlate({
      selection: source,
      slate,
    });

    expect(materialized.selectedEvidence.map((item) => item.feedItemId))
      .toEqual(["support-lead"]);
  });

  it("rematerializes a valid independent support for confidence", () => {
    const lead = xEvidence("valid-support-lead", 500);
    const support = redditEvidence("valid-support-peer", 100);
    const trustedSupport: SummaryEvidenceItem = {
      ...support,
      promotionFacts: {
        ...support.promotionFacts!,
        authorityAttestation: {
          status: "attested",
          official: false,
          trusted: true,
          attestedBy: "source_catalog",
        },
      },
    };
    const source = selection(
      [lead, trustedSupport],
      [storyCluster("valid-support-story", [lead, trustedSupport])],
    );
    const slate = composeReaderSummaryEditorialSlate({
      selection: source,
      candidates: [lead, trustedSupport],
    });
    const materialized = materializeReaderSummaryEditorialSlate({
      selection: source,
      slate,
    });
    const projection = buildReaderPostPromotionProjection({
      evidence: materialized.selectedEvidence,
      clusters: materialized.clusters,
      sourceWindow: materialized.sourceWindow,
      editorialSlate: slate,
      citations: materialized.selectedEvidence.map((item) => ({
        citationId: `citation-${item.feedItemId}`,
        feedItemId: item.feedItemId,
        sourceItemId: item.sourceItemId,
        providerKey: item.providerKey,
        field: "title" as const,
        canonicalUrl: item.canonicalUrl,
      })),
    });

    expect(projection.topReads[0]).toMatchObject({
      providerMetrics: [],
      confirmedProviderKeys: ["reddit", "x"],
      confidence: expect.objectContaining({
        score: 0.9500000000000001,
      }),
    });
    expect(projection.topReads[0]?.citationIds).toEqual([
      "citation-valid-support-lead",
      "citation-valid-support-peer",
    ]);
  });
});

const compose = (
  items: readonly SummaryEvidenceItem[],
  clusters = items.map((item) => storyCluster(item.feedItemId, [item])),
) => composeReaderSummaryEditorialSlate({
  selection: selection(items, clusters),
  candidates: items,
});

const selection = (
  items: readonly SummaryEvidenceItem[],
  clusters: readonly StoryCluster[],
): SummaryEvidenceSelection => ({
  rankingPolicyVersion: "fixture",
  sourceWindow: {
    windowId: "window-1",
    startedAt: periodStartedAt,
    endedAt: periodEndedAt,
    periodStartedAt,
    periodEndedAt,
    ingestionCutoff: periodEndedAt,
    selectedFeedItemIds: items.map((item) => item.feedItemId),
    storyClusterIds: clusters.map((cluster) => cluster.id),
  },
  selectedEvidence: items,
  clusters,
});

const xEvidence = (
  id: string,
  likes: number,
  overrides: {
    readonly relevanceScore?: number;
    readonly canonicalIdentity?: string;
  } = {},
): SummaryEvidenceItem => evidence({
  id,
  providerKey: "x-twitter",
  contentKind: "original_post",
  canonicalIdentity: overrides.canonicalIdentity ?? `story:${id}`,
  relevanceScore: overrides.relevanceScore,
  metrics: {
    provider: "x",
    likes,
    reposts: 0,
    weightedScore: likes,
  },
});

const redditEvidence = (
  id: string,
  score: number,
  overrides: { readonly canonicalIdentity?: string } = {},
): SummaryEvidenceItem => evidence({
  id,
  providerKey: "reddit",
  contentKind: "original_post",
  canonicalIdentity: overrides.canonicalIdentity ?? `story:${id}`,
  metrics: { provider: "reddit", score, upvoteRatio: 0.9 },
});

const hackerNewsEvidence = (
  id: string,
  points: number,
): SummaryEvidenceItem => evidence({
  id,
  providerKey: "hacker-news",
  contentKind: "story",
  canonicalIdentity: `story:${id}`,
  metrics: { provider: "hacker_news", points },
});

const evidence = (params: {
  readonly id: string;
  readonly providerKey: string;
  readonly contentKind: "original_post" | "story";
  readonly canonicalIdentity: string;
  readonly relevanceScore?: number;
  readonly metrics: NonNullable<
    NonNullable<SummaryEvidenceItem["promotionFacts"]>["metrics"]
  >;
}): SummaryEvidenceItem => ({
  feedItemId: params.id,
  sourceItemId: `source-${params.id}`,
  sourceBindingId: `binding-${params.id}`,
  interestId: "interest-ai",
  providerKey: params.providerKey,
  canonicalUrl: `https://example.test/${params.id}`,
  title: `Concrete product update ${params.id}`,
  bodyPreview: "A concrete self-contained product update.",
  publishedAt,
  observedAt,
  score: 1,
  whyImportant: ["It changes a concrete workflow."],
  contentQuality: {
    qualityScore: 0.9,
    interestRelevanceScore: params.relevanceScore ?? 0.9,
    engagementIntegrityScore: 0.9,
    eligibleForSummary: true,
    eligibleForTopRead: true,
    needsLlmReview: false,
    decision: "allow",
    flags: [],
    reason: "fixture",
  },
  promotionFacts: {
    contentKind: params.contentKind,
    canonicalIdentity: params.canonicalIdentity,
    safetyValid: true,
    freshnessValid: true,
    engagementAuthority: {
      observedAt: new Date("2026-08-29T23:00:00.000Z"),
      regressionState: "stable",
    },
    freshnessProvenance: {
      status: "observed",
      publishedAt,
      observedAt,
      ingestionCutoff: periodEndedAt,
    },
    metricsState: "observed",
    metrics: params.metrics,
  },
});

const storyCluster = (
  id: string,
  items: readonly SummaryEvidenceItem[],
): StoryCluster => ({
  id: `cluster-${id}`,
  storyKey: items[0]?.promotionFacts?.canonicalIdentity ?? id,
  representativeFeedItemId: items[0]!.feedItemId,
  duplicateFeedItemIds: items.slice(1).map((item) => item.feedItemId),
  interestIds: ["interest-ai"],
  providerKeys: [...new Set(items.map((item) => item.providerKey))],
  score: 1,
  observedAtRange: { startedAt: observedAt, endedAt: observedAt },
  whyImportant: ["It changes a concrete workflow."],
});
