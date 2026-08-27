import { selectReaderPostPromotions } from "./reader-post-promotion-selection";
import {
  attestedOfficialAuthority,
  attestedTrustedAuthority,
  hackerNewsMetrics,
  promotionInput,
  redditMetrics,
  xMetrics,
} from "./reader-post-promotion-policy.spec-support";

describe("reader post promotion selection", () => {
  it("merges the Aug 14 Cursor HN/X exact same-story evidence", () => {
    const result = selectReaderPostPromotions([
      promotionInput({
        candidateId: "cursor-hn",
        provider: "hacker-news",
        contentKind: "story",
        citationId: "citation-cursor-hn",
        canonicalIdentity: "story:cursor-aug-14",
        authorityAttestation: attestedOfficialAuthority,
        metrics: hackerNewsMetrics(70),
        whyImportant: "HN readers discussed the Cursor release.",
      }),
      promotionInput({
        candidateId: "cursor-x",
        provider: "x-twitter",
        citationId: "citation-cursor-x",
        canonicalIdentity: "story:cursor-aug-14",
        authorityAttestation: attestedOfficialAuthority,
        metrics: xMetrics(40, 20),
        relation: {
          kind: "same_story",
          targetCanonicalIdentity: "story:cursor-aug-14",
          confidence: 0.99,
          approved: true,
        },
        whyImportant: "Cursor announced the release on X.",
      }),
    ]);

    expect(result.top).toHaveLength(1);
    expect(result.top[0]).toMatchObject({
      providerCount: 2,
      citationIds: ["citation-cursor-hn", "citation-cursor-x"],
    });
    expect(result.top[0]?.support).toHaveLength(1);
    expect(result.decisions.map(({ candidateId, decision }) => ({
      candidateId,
      decision,
    }))).toEqual([
      { candidateId: "cursor-hn", decision: "promote_top" },
      { candidateId: "cursor-x", decision: "support_only" },
    ]);
  });

  it("merges trusted non-official HN support into an official watermark story", () => {
    const canonicalIdentity = "story:claude-watermark-aug-14";
    const result = selectReaderPostPromotions([
      promotionInput({
        candidateId: "watermark-official-x",
        canonicalIdentity,
        citationId: "citation-watermark-official-x",
        authorityAttestation: attestedOfficialAuthority,
        metrics: xMetrics(50, 10),
      }),
      promotionInput({
        candidateId: "watermark-hn",
        provider: "hacker_news",
        contentKind: "story",
        canonicalIdentity: "source:watermark-hn",
        citationId: "citation-watermark-hn",
        authorityAttestation: attestedTrustedAuthority,
        metrics: hackerNewsMetrics(25),
        relation: {
          kind: "same_story",
          targetCanonicalIdentity: canonicalIdentity,
          confidence: 0.99,
          approved: true,
        },
      }),
    ]);

    expect(result.top[0]?.providerCount).toBe(2);
    expect(result.top[0]?.support.map(({ candidateId }) => candidateId))
      .toEqual(["watermark-hn"]);
  });

  it("keeps same-provider series contextual without support or confidence boost", () => {
    const canonicalIdentity = "story:same-provider-series";
    const lead = promotionInput({
      candidateId: "series-lead",
      canonicalIdentity,
      citationId: "citation-series-lead",
      authorityAttestation: attestedOfficialAuthority,
    });
    const baseline = selectReaderPostPromotions([lead]);
    const withSeries = selectReaderPostPromotions([
      lead,
      promotionInput({
        candidateId: "series-follow-up",
        canonicalIdentity: "story:series-follow-up",
        citationId: "citation-series-follow-up",
        authorityAttestation: attestedTrustedAuthority,
        metrics: xMetrics(15, 10),
        relation: {
          kind: "same_story",
          targetCanonicalIdentity: canonicalIdentity,
          confidence: 0.99,
          approved: true,
        },
      }),
    ]);

    expect(withSeries.top[0]?.support).toEqual([]);
    expect(withSeries.top[0]?.citationIds).toEqual(["citation-series-lead"]);
    expect(withSeries.top[0]?.confidence).toBe(baseline.top[0]?.confidence);
    expect(withSeries.decisions[1]).toMatchObject({
      decision: "context_only",
      reason: "support_provider_not_independent",
    });
  });

  it("keeps X aliases in one provider family inside the same cluster", () => {
    const clusterId = "cluster:x-aliases";
    const baseline = selectReaderPostPromotions([
      promotionInput({
        candidateId: "x-alias-lead",
        provider: "x-twitter",
        clusterId,
        qualityScore: 0.9,
      }),
    ]);
    const result = selectReaderPostPromotions([
      promotionInput({
        candidateId: "x-alias-lead",
        provider: "x-twitter",
        clusterId,
        qualityScore: 0.9,
      }),
      promotionInput({
        candidateId: "x-alias-twitter",
        provider: "twitter",
        citationId: "citation-twitter",
        canonicalIdentity: "story:x-alias-twitter",
        clusterId,
        qualityScore: 0.8,
      }),
      promotionInput({
        candidateId: "x-alias-short",
        provider: "x",
        citationId: "citation-x-short",
        canonicalIdentity: "story:x-alias-short",
        clusterId,
        qualityScore: 0.7,
      }),
    ]);

    expect(result.top[0]).toMatchObject({
      providerCount: 1,
      support: [],
      citationIds: ["citation-x"],
      confidence: baseline.top[0]?.confidence,
    });
    expect(result.decisions.slice(1)).toEqual([
      expect.objectContaining({
        candidateId: "x-alias-twitter",
        decision: "context_only",
        reason: "support_provider_not_independent",
      }),
      expect.objectContaining({
        candidateId: "x-alias-short",
        decision: "context_only",
        reason: "support_provider_not_independent",
      }),
    ]);
  });

  it("admits Reddit as independent same-cluster support for X", () => {
    const clusterId = "cluster:x-reddit";
    const result = selectReaderPostPromotions([
      promotionInput({ candidateId: "x-lead", clusterId }),
      promotionInput({
        candidateId: "reddit-support",
        provider: "reddit",
        contentKind: "original_post",
        canonicalIdentity: "story:reddit-support",
        citationId: "citation-reddit",
        clusterId,
        metrics: redditMetrics(80, 0.95, 30),
      }),
    ]);

    expect(result.top).toHaveLength(1);
    expect(result.top[0]).toMatchObject({
      providerCount: 2,
      citationIds: ["citation-reddit", "citation-x"],
    });
    expect(result.top[0]?.support).toHaveLength(1);
  });

  it("omits low-signal Reddit posts and never promotes an official missing-metric lead", () => {
    const official = promotionInput({
      candidateId: "watermark-official",
      canonicalIdentity: "story:watermark-aug-14",
      citationId: "citation-watermark-official",
      authorityAttestation: attestedOfficialAuthority,
      metrics: undefined,
      metricsState: "missing",
      whyImportant: "The official account announced Watermark.",
    });
    const relation = {
      kind: "same_story" as const,
      targetCanonicalIdentity: official.canonicalIdentity,
      confidence: 0.99,
      approved: true,
    };
    const result = selectReaderPostPromotions([
      official,
      promotionInput({
        candidateId: "watermark-reddit-0-19",
        provider: "reddit",
        contentKind: "original_post",
        canonicalIdentity: "reddit:watermark-0-19",
        citationId: "citation-watermark-reddit-0-19",
        metrics: redditMetrics(0, 1, 19),
        relation,
        whyImportant: "A low-score Reddit thread.",
      }),
      promotionInput({
        candidateId: "watermark-reddit-7-5",
        provider: "reddit",
        contentKind: "original_post",
        canonicalIdentity: "reddit:watermark-7-5",
        citationId: "citation-watermark-reddit-7-5",
        metrics: redditMetrics(7, 1, 5),
        relation,
        whyImportant: "Another low-score Reddit thread.",
      }),
    ]);

    expect(result.top).toEqual([]);
    expect(result.additional).toEqual([]);
    expect(result.decisions.slice(1).map(({ decision, reason }) => ({
      decision,
      reason,
    }))).toEqual([
      { decision: "context_only", reason: "non_authoritative_relation" },
      { decision: "context_only", reason: "non_authoritative_relation" },
    ]);
  });

  it("keeps related-topic and heuristic-only evidence context-only and invisible", () => {
    const related = promotionInput({
      relation: {
        kind: "related_topic",
        targetCanonicalIdentity: "story:other",
        confidence: 1,
        approved: true,
      },
    });
    const heuristic = promotionInput({
      candidateId: "heuristic",
      canonicalIdentity: "story:heuristic",
      relation: {
        kind: "heuristic",
        targetCanonicalIdentity: "story:other",
        confidence: 1,
        approved: true,
      },
    });
    const result = selectReaderPostPromotions([related, heuristic]);

    expect(result.top).toEqual([]);
    expect(result.additional).toEqual([]);
    expect(result.decisions.map(({ decision }) => decision)).toEqual([
      "context_only",
      "context_only",
    ]);
  });

  it("does not let rejected or context evidence change any selected projection", () => {
    const lead = promotionInput();
    const baseline = selectReaderPostPromotions([lead]);
    const withNoise = selectReaderPostPromotions([
      lead,
      promotionInput({
        candidateId: "rejected-comment",
        canonicalIdentity: lead.canonicalIdentity,
        citationId: "citation-rejected-comment",
        contentKind: "comment",
        qualityScore: 1,
        whyImportant: "This rejected comment must not leak.",
      }),
      promotionInput({
        candidateId: "related-context",
        canonicalIdentity: "story:related",
        citationId: "citation-related-context",
        qualityScore: 1,
        relation: {
          kind: "related_topic",
          targetCanonicalIdentity: lead.canonicalIdentity,
          confidence: 1,
          approved: true,
        },
        whyImportant: "This context item must not leak.",
      }),
    ]);

    expect(withNoise.top).toEqual(baseline.top);
    expect(withNoise.additional).toEqual(baseline.additional);
  });

  it("requires approved same-story confidence at or above .92", () => {
    const lead = promotionInput({ canonicalIdentity: "story:lead" });
    const related = (confidence: number, approved = true) => promotionInput({
      candidateId: `support-${confidence}-${approved}`,
      canonicalIdentity: `story:source-${confidence}-${approved}`,
      provider: "hacker_news",
      contentKind: "story",
      citationId: `citation-${confidence}-${approved}`,
      metrics: hackerNewsMetrics(25),
      authorityAttestation: attestedTrustedAuthority,
      relation: {
        kind: "same_story",
        targetCanonicalIdentity: lead.canonicalIdentity,
        confidence,
        approved,
      },
    });
    const result = selectReaderPostPromotions([
      lead,
      related(0.919_999),
      related(0.92),
      related(0.920_001),
      related(1, false),
      promotionInput({
        candidateId: "support-exact-identity-unapproved",
        canonicalIdentity: lead.canonicalIdentity,
        provider: "hacker_news",
        contentKind: "story",
        citationId: "citation-exact-identity-unapproved",
        metrics: hackerNewsMetrics(25),
        relation: {
          kind: "same_story",
          targetCanonicalIdentity: lead.canonicalIdentity,
          confidence: 1,
          approved: false,
        },
      }),
    ]);

    expect(result.top[0]?.support.map(({ candidateId }) => candidateId)).toEqual([
      "support-0.92-true",
      "support-0.920001-true",
    ]);
    expect(result.decisions.map(({ decision }) => decision)).toEqual([
      "promote_top",
      "context_only",
      "support_only",
      "support_only",
      "context_only",
      "context_only",
    ]);
  });

  it("requires support to share the selected lead window", () => {
    const lead = promotionInput({ canonicalIdentity: "story:lead" });
    const support = promotionInput({
      candidateId: "support-other-window",
      canonicalIdentity: "story:support",
      provider: "hacker_news",
      contentKind: "story",
      metrics: hackerNewsMetrics(25),
      authorityAttestation: attestedOfficialAuthority,
      periodStart: new Date("2026-08-13T00:00:00.000Z"),
      relation: {
        kind: "same_story",
        targetCanonicalIdentity: lead.canonicalIdentity,
        confidence: 0.99,
        approved: true,
      },
    });
    const result = selectReaderPostPromotions([lead, support]);

    expect(result.top[0]?.support).toEqual([]);
    expect(result.decisions[1]).toMatchObject({
      decision: "context_only",
      reason: "support_window_mismatch",
    });
  });

  it("deduplicates semantic clusters across tiers before independent 8/8 caps", () => {
    const top = Array.from({ length: 9 }, (_, index) => promotionInput({
      candidateId: `top-${index}`,
      canonicalIdentity: `story:top-${index}`,
      citationId: `citation-top-${index}`,
      publishedAt: new Date(Date.parse("2026-08-14T12:00:00.000Z") + index),
      metrics: xMetrics(30 + index, 20),
      clusterId: `cluster-${100 - index}`,
    }));
    const additional = Array.from({ length: 9 }, (_, index) => promotionInput({
      candidateId: `additional-${index}`,
      canonicalIdentity: index === 0 ? "story:top-0" : `story:additional-${index}`,
      citationId: `citation-additional-${index}`,
      provider: "hacker_news",
      contentKind: "story",
      metrics: hackerNewsMetrics(index === 0 ? 49 : 25 + index),
      clusterId: index === 0 ? "cluster-100" : `cluster-${index}`,
    }));
    const result = selectReaderPostPromotions([...top, ...additional]);

    expect(result.top).toHaveLength(8);
    expect(result.additional).toHaveLength(8);
    expect(result.additional.some(({ candidate }) =>
      candidate.canonicalIdentity === "story:top-0",
    )).toBe(false);
    expect(result.additional.map(({ candidate }) => candidate.candidateId)).toEqual(
      expect.arrayContaining(Array.from({ length: 8 }, (_, index) =>
        `additional-${index + 1}`,
      )),
    );
  });

  it("sorts Additional by the exact usefulness formula then timestamp and canonical id", () => {
    const inputs = [
      promotionInput({
        candidateId: "lower-quality",
        canonicalIdentity: "story:z",
        provider: "hacker_news",
        contentKind: "story",
        metrics: hackerNewsMetrics(25),
      relevanceScore: 0.5,
      }),
      promotionInput({
        candidateId: "higher-quality",
        canonicalIdentity: "story:y",
        provider: "hacker_news",
        contentKind: "story",
        metrics: hackerNewsMetrics(25),
      relevanceScore: 0.9,
      }),
      promotionInput({
        candidateId: "canonical-tie-break",
        canonicalIdentity: "story:a",
        provider: "hacker_news",
        contentKind: "story",
        metrics: hackerNewsMetrics(25),
      relevanceScore: 0.5,
      }),
    ];
    const result = selectReaderPostPromotions(inputs);

    expect(result.additional.map(({ candidate }) => candidate.candidateId)).toEqual([
      "higher-quality",
      "canonical-tie-break",
      "lower-quality",
    ]);
    expect(result.additional[0]?.usefulness).toBeCloseTo(
      0.35 * 0.5 + 0.25 * 0.8 + 0.2 * 0.9 + 0.1 * 0.8 + 0.1 * 0.5,
      8,
    );
  });

  it.each(["top", "additional"] as const)(
    "reserves deterministic %s lane diversity before the global cap",
    (lane) => {
      const x = Array.from({ length: 10 }, (_, index) => promotionInput({
        candidateId: `${lane}-x-${index}`,
        canonicalIdentity: `story:${lane}:x:${index}`,
        clusterId: `cluster:${lane}:x:${index}`,
        metrics: lane === "top" ? xMetrics(100 - index, 30) : xMetrics(21, 7),
      }));
      const alternative = promotionInput({
        candidateId: `${lane}-reddit-alternative`,
        canonicalIdentity: `story:${lane}:reddit`,
        clusterId: `cluster:${lane}:reddit`,
        provider: "reddit",
        metrics: { provider: "reddit", score: lane === "top" ? 50 : 25 },
      });

      const selected = selectReaderPostPromotions([...x, alternative])[lane];

      expect(selected).toHaveLength(lane === "top" ? 7 : 8);
      expect(selected.map((item) => item.candidate.candidateId))
        .toContain(`${lane}-reddit-alternative`);
      if (lane === "top") {
        expect(selected.filter((item) => item.candidate.provider === "x"))
          .toHaveLength(6);
      }
      expect(selectReaderPostPromotions([alternative, ...x])[lane])
        .toEqual(selected);
    },
  );

  it("groups cross-source Cursor and Claude watermark clusters without merging controls", () => {
    const inputs = [
      promotionInput({ candidateId: "cursor-x", canonicalIdentity: "url:cursor-x",
        clusterId: "story:cursor-agents", metrics: xMetrics(40, 15) }),
      promotionInput({ candidateId: "cursor-hn", canonicalIdentity: "url:cursor-hn",
        clusterId: "story:cursor-agents", provider: "hacker_news",
        contentKind: "story", metrics: hackerNewsMetrics(70) }),
      promotionInput({ candidateId: "watermark-x", canonicalIdentity: "url:watermark-x",
        clusterId: "story:claude-watermark", metrics: xMetrics(40, 15) }),
      promotionInput({ candidateId: "watermark-reddit",
        canonicalIdentity: "url:watermark-reddit",
        clusterId: "story:claude-watermark", provider: "reddit",
        metrics: { provider: "reddit", score: 60 } }),
      promotionInput({ candidateId: "cursor-theme-control",
        canonicalIdentity: "url:cursor-theme", clusterId: "story:cursor-theme",
        provider: "hacker_news", contentKind: "story",
        metrics: hackerNewsMetrics(60) }),
    ];

    const selection = selectReaderPostPromotions(inputs);

    expect(selection.top).toHaveLength(3);
    expect(selection.top.map((item) => [item.candidate.clusterId,
      item.support.map((support) => support.candidateId)])).toEqual(
      expect.arrayContaining([
        ["story:cursor-agents", [expect.stringMatching(/^cursor-/u)]],
        ["story:claude-watermark", [expect.stringMatching(/^watermark-/u)]],
        ["story:cursor-theme", []],
      ]),
    );
  });

  it("orders candidates one microsecond apart without millisecond collapse", () => {
    const shared = {
      publishedAt: new Date("2026-08-14T12:00:00.123Z"),
      exactPeriodStart: "2026-08-14T00:00:00.000000Z",
      exactPeriodEnd: "2026-08-15T00:00:00.000000Z",
      exactIngestionCutoff: "2026-08-15T01:00:00.000000Z",
    };
    const selection = selectReaderPostPromotions([
      promotionInput({
        ...shared,
        candidateId: "microsecond-earlier",
        canonicalIdentity: "story:microsecond-earlier",
        exactPublishedAt: "2026-08-14T12:00:00.123000Z",
      }),
      promotionInput({
        ...shared,
        candidateId: "microsecond-later",
        canonicalIdentity: "story:microsecond-later",
        exactPublishedAt: "2026-08-14T12:00:00.123001Z",
      }),
    ]);

    expect(selection.top.map((item) => item.candidate.candidateId)).toEqual([
      "microsecond-later",
      "microsecond-earlier",
    ]);
  });

  it("does not boost Additional usefulness with same-story support", () => {
    const supported = promotionInput({
      candidateId: "supported",
      canonicalIdentity: "story:supported",
      provider: "hacker_news",
      contentKind: "story",
      relevanceScore: 0.7,
      metrics: hackerNewsMetrics(25),
    });
    const result = selectReaderPostPromotions([
      supported,
      promotionInput({
        candidateId: "unsupported",
        canonicalIdentity: "story:unsupported",
        provider: "hacker_news",
        contentKind: "story",
        relevanceScore: 0.75,
        metrics: hackerNewsMetrics(25),
      }),
      promotionInput({
        candidateId: "supported-x",
        canonicalIdentity: "source:supported-x",
        provider: "x",
        metrics: xMetrics(21, 7),
        authorityAttestation: attestedOfficialAuthority,
        relation: {
          kind: "same_story",
          targetCanonicalIdentity: supported.canonicalIdentity,
          confidence: 0.92,
          approved: true,
        },
      }),
    ]);
    expect(result.additional.map((item) => item.candidate.candidateId)).toEqual([
      "unsupported",
      "supported",
    ]);
    expect(result.additional[1]?.support).toHaveLength(1);
    expect(result.additional[1]!.usefulness - result.additional[0]!.usefulness)
      .toBeCloseTo(0.2 * (0.7 - 0.75), 8);
  });

  it("is invariant to input order and cluster ids", () => {
    const inputs = Array.from({ length: 20 }, (_, index) => promotionInput({
      candidateId: `candidate-${index}`,
      canonicalIdentity: `story:${String(index).padStart(2, "0")}`,
      citationId: `citation-${index}`,
      provider: "hacker_news",
      contentKind: "story",
      metrics: hackerNewsMetrics(25 + (index % 20)),
      clusterId: `cluster-${20 - index}`,
    }));
    const forward = selectReaderPostPromotions(inputs);
    const reverse = selectReaderPostPromotions([...inputs].reverse());

    expect(reverse.additional.map(({ candidate }) => candidate.candidateId)).toEqual(
      forward.additional.map(({ candidate }) => candidate.candidateId),
    );
  });

  it("rejects empty or duplicate candidate ids instead of overwriting", () => {
    expect(() => selectReaderPostPromotions([
      promotionInput({ candidateId: "" }),
    ])).toThrow("candidate id must be non-empty");
    expect(() => selectReaderPostPromotions([
      promotionInput({ candidateId: "duplicate" }),
      promotionInput({ candidateId: "duplicate", canonicalIdentity: "story:2" }),
    ])).toThrow("Duplicate reader post promotion candidate id: duplicate");
  });
});
