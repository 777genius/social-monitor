import {
  evaluateReaderPostPromotion,
  READER_POST_PROMOTION_POLICY_V1,
  type ReaderPostPromotionInput,
} from "./reader-post-promotion-policy";
import {
  attestedOfficialAuthority,
  githubRadarMetrics,
  hackerNewsMetrics,
  promotionInput,
  redditMetrics,
  xMetrics,
} from "./reader-post-promotion-policy.spec-support";

describe("reader_post_promotion.v1 eligibility", () => {
  it("exposes one recursively immutable policy object with centralized constants", () => {
    expect(READER_POST_PROMOTION_POLICY_V1.version).toBe(
      "reader_post_promotion.v1",
    );
    expect(Object.isFrozen(READER_POST_PROMOTION_POLICY_V1)).toBe(true);
    expect(Object.isFrozen(READER_POST_PROMOTION_POLICY_V1.floors)).toBe(true);
    expect(Object.isFrozen(READER_POST_PROMOTION_POLICY_V1.floors.x.top)).toBe(
      true,
    );
  });

  it.each([
    ["comment", "non_original_content"],
    ["reply", "non_original_content"],
    ["quote", "non_original_content"],
    ["github_trending", "non_original_content"],
  ] as const)("rejects %s content even when it is official", (contentKind, reason) => {
    const result = evaluateReaderPostPromotion(
      promotionInput({
        contentKind,
        authorityAttestation: attestedOfficialAuthority,
        metrics: undefined,
        metricsState: "missing",
      }),
    );

    expect(result).toMatchObject({ decision: "reject", reason });
  });

  it.each([
    ["unsupported provider", { provider: "mastodon" }, "unsupported_provider"],
    ["wrong kind", { contentKind: "story" as const }, "wrong_content_kind"],
    ["missing metrics", { metrics: undefined }, "metrics_missing"],
    [
      "conflicting metrics",
      { metrics: redditMetrics(100) },
      "metrics_conflict",
    ],
    [
      "malformed metrics",
      { metrics: xMetrics(Number.NaN, 20) },
      "metrics_malformed",
    ],
    [
      "missing required metric",
      { metrics: { provider: "x", likes: 30 } as ReturnType<typeof xMetrics> },
      "metrics_missing",
    ],
    [
      "conflicting provider fields",
      {
        metrics: {
          ...xMetrics(30, 20),
          score: 100,
        } as ReturnType<typeof xMetrics>,
      },
      "metrics_conflict",
    ],
    [
      "outside window",
      { publishedAt: new Date("2026-08-15T00:00:00.000Z") },
      "outside_period",
    ],
    [
      "late observation",
      { observedAt: new Date("2026-08-15T01:00:00.001Z") },
      "observed_after_cutoff",
    ],
    ["stale evidence", { freshnessValid: false }, "stale_evidence"],
  ] as const)("fails closed for %s", (_name, overrides, reason) => {
    expect(evaluateReaderPostPromotion(promotionInput(overrides))).toMatchObject({
      decision: "reject",
      reason,
    });
  });

  it("applies the period as [start, end) and permits observation at cutoff", () => {
    expect(
      evaluateReaderPostPromotion(
        promotionInput({ publishedAt: new Date("2026-08-14T00:00:00.000Z") }),
      ).decision,
    ).toBe("promote_top");
    expect(
      evaluateReaderPostPromotion(
        promotionInput({ observedAt: new Date("2026-08-15T01:00:00.000Z") }),
      ).decision,
    ).toBe("promote_top");
  });

  it.each([
    ["published start -1us", {
      exactPublishedAt: "2026-08-13T23:59:59.999999Z",
    }, "outside_period"],
    ["published start", {
      exactPublishedAt: "2026-08-14T00:00:00.000000Z",
    }, "top_engagement_floor_met"],
    ["published end -1us", {
      exactPublishedAt: "2026-08-14T23:59:59.999999Z",
      exactObservedAt: "2026-08-15T00:00:00.000000Z",
    }, "top_engagement_floor_met"],
    ["published end", {
      exactPublishedAt: "2026-08-15T00:00:00.000000Z",
      exactObservedAt: "2026-08-15T00:00:00.000000Z",
    }, "outside_period"],
    ["observed cutoff -1us", {
      exactObservedAt: "2026-08-15T00:59:59.999999Z",
    }, "top_engagement_floor_met"],
    ["observed cutoff", {
      exactObservedAt: "2026-08-15T01:00:00.000000Z",
    }, "top_engagement_floor_met"],
    ["observed cutoff +1us", {
      exactObservedAt: "2026-08-15T01:00:00.000001Z",
    }, "observed_after_cutoff"],
  ] as const)("enforces exact microsecond boundary: %s", (_name, exact, reason) => {
    expect(evaluateReaderPostPromotion(promotionInput({
      ...exact,
      exactPeriodStart: "2026-08-14T00:00:00.000000Z",
      exactPeriodEnd: "2026-08-15T00:00:00.000000Z",
      exactIngestionCutoff: "2026-08-15T01:00:00.000000Z",
    }))).toMatchObject({ reason });
  });

  it("rejects a normalized-but-invalid exact calendar timestamp", () => {
    expect(evaluateReaderPostPromotion(promotionInput({
      exactPublishedAt: "2026-02-30T12:00:00.000000Z",
      exactPeriodStart: "2026-02-01T00:00:00.000000Z",
      exactPeriodEnd: "2026-03-01T00:00:00.000000Z",
      exactIngestionCutoff: "2026-03-01T01:00:00.000000Z",
    }))).toMatchObject({
      decision: "reject",
      reason: "invalid_publication_time",
    });
  });

  it("does not let attested official status substitute for engagement rating", () => {
    const official = promotionInput({
      authorityAttestation: attestedOfficialAuthority,
      metrics: xMetrics(0, 0),
      metricsState: "observed",
    });
    expect(evaluateReaderPostPromotion(official)).toMatchObject({
      decision: "reject",
      reason: "engagement_floor_not_met",
    });
    expect(
      evaluateReaderPostPromotion({ ...official, safetyValid: false }).reason,
    ).toBe("safety_gate_failed");
    expect(evaluateReaderPostPromotion({
      ...official,
      relation: {
        kind: "same_story",
        targetCanonicalIdentity: "story:lead",
        confidence: 0.92,
        approved: true,
      },
    })).toMatchObject({
      decision: "reject",
      reason: "engagement_floor_not_met",
    });
    expect(evaluateReaderPostPromotion({
      ...official,
      metrics: xMetrics(15, 10),
      relation: {
        kind: "same_story",
        targetCanonicalIdentity: "story:lead",
        confidence: 0.92,
        approved: true,
      },
    })).toMatchObject({
      decision: "support_only",
      reason: "authoritative_same_story_support",
    });
    expect(
      evaluateReaderPostPromotion({
        ...official,
        metrics: xMetrics(Number.NaN, 0),
        metricsState: "observed",
      }).reason,
    ).toBe("metrics_malformed");
    expect(
      evaluateReaderPostPromotion({
        ...official,
        relation: {
          kind: "related_topic",
          targetCanonicalIdentity: "story:other",
          confidence: 1,
          approved: true,
        },
      }).decision,
    ).toBe("context_only");
    expect(evaluateReaderPostPromotion({
      ...official,
      contentKind: "reply",
    })).toMatchObject({ decision: "reject", reason: "non_original_content" });
    expect(evaluateReaderPostPromotion({
      ...official,
      freshnessValid: false,
    })).toMatchObject({ decision: "reject", reason: "stale_evidence" });
  });

  it("fails closed for official posts with missing or malformed metrics", () => {
    expect(evaluateReaderPostPromotion(promotionInput({
      authorityAttestation: attestedOfficialAuthority,
      metrics: undefined,
      metricsState: "missing",
    }))).toMatchObject({ decision: "reject", reason: "metrics_missing" });
    expect(evaluateReaderPostPromotion(promotionInput({
      authorityAttestation: attestedOfficialAuthority,
      metrics: xMetrics(Number.NaN, 0),
      metricsState: "observed",
    }))).toMatchObject({ decision: "reject", reason: "metrics_malformed" });
  });

  it.each(["malformed", "conflict"] as const)(
    "rejects attested official same-story support with %s metrics state",
    (metricsState) => {
      expect(evaluateReaderPostPromotion(promotionInput({
        authorityAttestation: attestedOfficialAuthority,
        metrics: undefined,
        metricsState,
        relation: {
          kind: "same_story",
          targetCanonicalIdentity: "story:valid-lead",
          confidence: 0.99,
          approved: true,
        },
      }))).toMatchObject({
        decision: "reject",
        reason: metricsState === "conflict"
            ? "metrics_conflict"
            : "metrics_malformed",
      });
    },
  );
});

describe("reader_post_promotion.v1 provider floors", () => {
  it.each([
    ["Top threshold minus one", 29, 20, "promote_additional", 69 / 70],
    ["Top likes branch exact", 30, 20, "promote_top", 1],
    ["Top repost branch exact", 50, 10, "promote_top", 1],
    ["Additional threshold minus one", 14, 10, "reject", 0],
    ["Additional likes branch exact", 15, 10, "promote_additional", 35 / 70],
    ["Additional repost branch exact", 21, 7, "promote_additional", 35 / 70],
  ] as const)(
    "checks %s with likes=%i and reposts=%i",
    (_boundary, likes, reposts, decision, normalizedStrength) => {
      const result = evaluateReaderPostPromotion(
        promotionInput({ metrics: xMetrics(likes, reposts) }),
      );
      expect(result.decision).toBe(decision);
      expect(result.normalizedStrength).toBeCloseTo(normalizedStrength);
    },
  );

  it("rejects a supplied X weighted score that conflicts with likes + 2*reposts", () => {
    expect(evaluateReaderPostPromotion(
      promotionInput({ metrics: xMetrics(30, 20, 69) }),
    )).toMatchObject({ decision: "reject", reason: "metrics_conflict" });
  });

  it.each([
    [50, 0.6, "promote_top"],
    [50, 0.59, "promote_additional"],
    [49, 0.6, "promote_additional"],
    [25, 0.55, "promote_additional"],
    [25, 0.54, "reject"],
    [24, 1, "reject"],
    [50, undefined, "promote_top"],
    [25, undefined, "promote_additional"],
  ] as const)("applies Reddit score/ratio boundaries", (score, ratio, decision) => {
    const input = promotionInput({
      provider: "reddit",
      contentKind: "original_post",
      metrics: redditMetrics(score, ratio),
    });
    expect(evaluateReaderPostPromotion(input).decision).toBe(decision);
  });

  it("never uses Reddit comments as eligibility", () => {
    const evaluate = (score: number, comments: number, ratio: number) =>
      evaluateReaderPostPromotion(promotionInput({
        provider: "reddit",
        contentKind: "original_post",
        metrics: redditMetrics(score, ratio, comments),
      })).decision;
    expect(evaluate(0, 19, 1)).toBe("reject");
    expect(evaluate(7, 5, 1)).toBe("reject");
    expect(evaluate(24, 1_000_000, 1)).toBe("reject");
    expect(evaluate(25, 0, 0.55)).toBe("promote_additional");
  });

  it.each([
    [24, "reject"],
    [25, "promote_additional"],
    [49, "promote_additional"],
    [50, "promote_top"],
    [51, "promote_top"],
  ] as const)("applies Hacker News point boundary %i", (points, decision) => {
    expect(
      evaluateReaderPostPromotion(
        promotionInput({
          provider: "hacker_news",
          contentKind: "story",
          metrics: hackerNewsMetrics(points),
        }),
      ).decision,
    ).toBe(decision);
  });

  it.each([
    [24, 0, "reject"],
    [25, 0, "promote_additional"],
    [49, 0, "promote_additional"],
    [50, 0, "promote_top"],
    [0, 49, "reject"],
    [0, 50, "promote_additional"],
    [0, 99, "promote_additional"],
    [0, 100, "promote_top"],
  ] as const)(
    "applies GitHub radar star %i or fork %i delta boundary",
    (starsDelta, forksDelta, decision) => {
      expect(
        evaluateReaderPostPromotion(
          promotionInput({
            provider: "github-repo-radar",
            contentKind: "repository",
            metrics: githubRadarMetrics({ hours: 24, starsDelta, forksDelta }),
          }),
        ).decision,
      ).toBe(decision);
    },
  );

  it("rejects GitHub deltas without their typed snapshot window", () => {
    const metrics = githubRadarMetrics({ hours: 24, delta: 50 });
    if (metrics.provider !== "github_radar") throw new Error("invalid fixture");
    expect(
      evaluateReaderPostPromotion(
        promotionInput({
          provider: "github_radar",
          contentKind: "repository",
          metrics: {
            ...metrics,
            windowEndedAt: new Date("2026-08-15T01:00:00.000Z"),
          },
        }),
      ).reason,
    ).toBe("metrics_malformed");
  });

  it("rejects unknown GitHub delta fields or a mismatched checkedAt", () => {
    const metrics = githubRadarMetrics({ hours: 24, delta: 50 });
    if (metrics.provider !== "github_radar") throw new Error("invalid fixture");
    expect(evaluateReaderPostPromotion(promotionInput({
      provider: "github_radar",
      contentKind: "repository",
      metrics: { ...metrics, legacyStarsDelta48h: 100 } as never,
    })).reason).toBe("metrics_conflict");
    expect(evaluateReaderPostPromotion(promotionInput({
      provider: "github_radar",
      contentKind: "repository",
      checkedAt: new Date("2026-08-14T23:59:59.999Z"),
      metrics,
    })).reason).toBe("metrics_malformed");
  });

  it("is deterministic across a bounded property-style provider corpus", () => {
    for (let likes = 0; likes <= 80; likes += 4) {
      for (let reposts = 0; reposts <= 40; reposts += 2) {
        const input = promotionInput({ metrics: xMetrics(likes, reposts) });
        expect(evaluateReaderPostPromotion(input)).toEqual(
          evaluateReaderPostPromotion(input),
        );
      }
    }
  });

  it("matches an independent frozen provider-boundary holdout oracle", () => {
    const holdout: readonly {
      readonly name: string;
      readonly input: Partial<ReaderPostPromotionInput>;
      readonly expected: readonly [string, string];
    }[] = [
      { name: "x top", input: { metrics: xMetrics(30, 20) },
        expected: ["promote_top", "top_engagement_floor_met"] },
      { name: "x additional", input: { metrics: xMetrics(15, 10) },
        expected: ["promote_additional", "additional_engagement_floor_met"] },
      { name: "x reject", input: { metrics: xMetrics(14, 10) },
        expected: ["reject", "engagement_floor_not_met"] },
      { name: "reddit top", input: { provider: "reddit",
        metrics: redditMetrics(50, 0.6) },
        expected: ["promote_top", "top_engagement_floor_met"] },
      { name: "reddit additional", input: { provider: "reddit",
        metrics: redditMetrics(25, 0.55) },
        expected: ["promote_additional", "additional_engagement_floor_met"] },
      { name: "hn reject", input: { provider: "hacker_news",
        contentKind: "story", metrics: hackerNewsMetrics(24) },
        expected: ["reject", "engagement_floor_not_met"] },
      { name: "github top", input: { provider: "github_radar",
        contentKind: "repository", metrics: githubRadarMetrics({ hours: 24,
          delta: 50 }) },
        expected: ["promote_top", "top_engagement_floor_met"] },
      { name: "github additional", input: { provider: "github_radar",
        contentKind: "repository", metrics: githubRadarMetrics({ hours: 48,
          delta: 50 }) },
        expected: ["promote_additional", "additional_engagement_floor_met"] },
    ];
    for (const sample of holdout) {
      const result = evaluateReaderPostPromotion(promotionInput(sample.input));
      expect({
        name: sample.name,
        result: [result.decision, result.reason],
      }).toEqual({ name: sample.name, result: sample.expected });
    }
  });
});
