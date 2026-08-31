import {
  evaluateReaderPromotionV2,
  rankReaderPromotionV2,
  type ReaderPromotionV2Candidate,
} from "./reader-promotion-policy-v2";
import {
  githubPromotionCandidate,
  hackerNewsPromotionCandidate,
  redditPromotionCandidate,
  xPromotionCandidate,
} from "./reader-promotion-policy-v2.spec-fixtures";

describe("Reader Promotion Policy V2", () => {
  it("ranks otherwise equal X posts with 11,112 likes above 89 likes", () => {
    const lower = xPromotionCandidate({
      candidateId: "x-lower",
      likes: 89,
    });
    const higher = xPromotionCandidate({
      candidateId: "x-higher",
      likes: 11_112,
    });

    const ranking = rankReaderPromotionV2([lower, higher]);

    expect(ranking.orderedCandidateIds).toEqual(["x-higher", "x-lower"]);
    expect(ranking.ranked[0]?.providerSignal).toBe(11_112);
    expect(ranking.ranked[0]?.components.engagementSalience)
      .toBeGreaterThan(ranking.ranked[1]!.components.engagementSalience);
  });

  it.each([
    ["Reddit", redditPromotionCandidate(), 64, 50],
    ["Hacker News", hackerNewsPromotionCandidate(), 73, 50],
    ["GitHub", githubPromotionCandidate(), 38, 50],
  ] as const)(
    "admits a qualifying authoritative %s example above its floor",
    (_name, candidate, signal, topFloor) => {
      expect(evaluateReaderPromotionV2(candidate)).toMatchObject({
        admitted: true,
        providerSignal: signal,
        providerTopFloor: topFloor,
        admissionAttestation: { provider: { passed: true } },
      });
    },
  );

  it.each([
    ["missing", { state: "missing" }, "engagement_missing"],
    ["malformed", {
      state: "observed",
      authoritative: true,
      metrics: { provider: "x", likes: Number.NaN, reposts: 8 },
    }, "engagement_malformed"],
    ["conflicting state", { state: "conflict" }, "engagement_conflict"],
    ["conflicting aliases", {
      state: "observed",
      authoritative: true,
      metrics: {
        provider: "x", likes: 50, reposts: 10, reportedSignal: 999,
      },
    }, "engagement_conflict"],
    ["unauthoritative", {
      state: "observed",
      authoritative: false,
      metrics: { provider: "x", likes: 50, reposts: 10 },
    }, "engagement_unauthoritative"],
  ] as const)(
    "rejects %s engagement",
    (_name, engagement, reason) => {
      const candidate = {
        ...xPromotionCandidate({ candidateId: `rejected-${reason}`, likes: 50 }),
        engagement,
      } as ReaderPromotionV2Candidate;

      expect(evaluateReaderPromotionV2(candidate)).toMatchObject({
        admitted: false,
        reasons: expect.arrayContaining([reason]),
      });
    },
  );

  it.each([
    ["relevance", "relevanceFloorMet", "relevance_floor_not_met"],
    ["quality", "qualityFloorMet", "quality_floor_not_met"],
    ["integrity", "integrityFloorMet", "integrity_floor_not_met"],
    ["safety", "safetyFloorMet", "safety_floor_not_met"],
  ] as const)(
    "does not let viral engagement bypass the hard %s floor",
    (_name, gate, reason) => {
      const baseline = xPromotionCandidate({
        candidateId: `viral-${gate}`,
        likes: 9_999_999,
      });
      const candidate = {
        ...baseline,
        admission: { ...baseline.admission, [gate]: false },
      };

      expect(evaluateReaderPromotionV2(candidate)).toMatchObject({
        admitted: false,
        reasons: expect.arrayContaining([reason]),
      });
    },
  );

  it("rejects a viral but numerically irrelevant item", () => {
    const candidate = {
      ...xPromotionCandidate({ candidateId: "viral-irrelevant", likes: 9_999_999 }),
      relevanceScore: 0.49,
    };

    expect(evaluateReaderPromotionV2(candidate)).toMatchObject({
      admitted: false,
      reasons: expect.arrayContaining(["relevance_floor_not_met"]),
    });
  });

  it("does not let ranking quality bypass the provider admission floor", () => {
    const candidate = xPromotionCandidate({
      candidateId: "below-provider-floor",
      likes: 14,
    });

    expect(evaluateReaderPromotionV2(candidate)).toMatchObject({
      admitted: false,
      reasons: ["provider_floor_not_met"],
    });
  });

  it("uses the bounded provider-relative salience formula and fixed weights", () => {
    const result = evaluateReaderPromotionV2(xPromotionCandidate({
      candidateId: "formula",
      likes: 70,
    }));
    expect(result.admitted).toBe(true);
    if (!result.admitted) return;

    expect(result.relativePopularity).toBe(1);
    expect(result.components.engagementSalience).toBe(0.5);
    expect(result.components).toMatchObject({
      weightedEngagement: 0.2,
      weightedRelevance: 0.27,
      weightedEvidenceQuality: 0.12,
      weightedIntegrity: 0.085,
      weightedFreshness: 0.0375,
      total: 0.7125,
    });
  });

  it("resolves an exact score tie identically regardless of input order", () => {
    const a = xPromotionCandidate({
      candidateId: "candidate-a",
      canonicalIdentity: "fixture:tie:a",
      likes: 70,
    });
    const b = xPromotionCandidate({
      candidateId: "candidate-b",
      canonicalIdentity: "fixture:tie:b",
      likes: 70,
    });

    const forward = rankReaderPromotionV2([b, a]);
    const reverse = rankReaderPromotionV2([a, b]);

    expect(forward.orderedCandidateIds).toEqual(["candidate-a", "candidate-b"]);
    expect(reverse.orderedCandidateIds).toEqual(forward.orderedCandidateIds);
    expect(reverse.digestInputs).toEqual(forward.digestInputs);
  });

  it("returns byte-identical identities and digest inputs for identical input", () => {
    const candidates = [
      redditPromotionCandidate(),
      xPromotionCandidate({ candidateId: "digest-x", likes: 89 }),
      hackerNewsPromotionCandidate(),
    ];

    expect(JSON.stringify(rankReaderPromotionV2(candidates))).toBe(
      JSON.stringify(rankReaderPromotionV2(candidates)),
    );
  });

  it("is monotonic as provider signal increases with other inputs fixed", () => {
    let previousSalience = -1;
    let previousTotal = -1;
    for (const likes of [35, 70, 89, 500, 11_112]) {
      const result = evaluateReaderPromotionV2(xPromotionCandidate({
        candidateId: `monotonic-${likes}`,
        likes,
      }));
      expect(result.admitted).toBe(true);
      if (!result.admitted) continue;

      expect(result.components.engagementSalience)
        .toBeGreaterThanOrEqual(previousSalience);
      expect(result.components.total).toBeGreaterThanOrEqual(previousTotal);
      previousSalience = result.components.engagementSalience;
      previousTotal = result.components.total;
    }
  });

  it("preserves Reddit score integrity and GitHub 24-hour authority", () => {
    const reddit = redditPromotionCandidate();
    const redditConflict = {
      ...reddit,
      engagement: {
        state: "observed",
        authoritative: true,
        metrics: {
          provider: "reddit", score: 64, upvotes: 65, upvoteRatio: 0.81,
        },
      },
    } as ReaderPromotionV2Candidate;
    const github = githubPromotionCandidate();
    const githubUnauthoritative = {
      ...github,
      engagement: { ...github.engagement, authoritative: false },
    } as ReaderPromotionV2Candidate;
    const githubCheckedAtConflict = {
      ...github,
      engagement: {
        ...github.engagement,
        authority: {
          source: "github_checked_at",
          observedAt: "2026-08-29T17:00:00.001Z",
          regressionState: "stable",
        },
      },
    } as ReaderPromotionV2Candidate;

    expect(evaluateReaderPromotionV2(redditConflict)).toMatchObject({
      admitted: false,
      reasons: ["engagement_conflict"],
    });
    expect(evaluateReaderPromotionV2(githubUnauthoritative)).toMatchObject({
      admitted: false,
      reasons: ["engagement_unauthoritative"],
    });
    expect(evaluateReaderPromotionV2(githubCheckedAtConflict)).toMatchObject({
      admitted: false,
      reasons: ["engagement_conflict"],
    });
  });

  it("rejects a stale high social metric snapshot relative to the explicit cutoff", () => {
    const baseline = xPromotionCandidate({
      candidateId: "stale-high-metric",
      likes: 11_112,
    });
    const candidate = {
      ...baseline,
      engagement: {
        ...baseline.engagement,
        authority: {
          source: "durable_projection",
          observedAt: "2026-08-29T11:59:59.999Z",
          regressionState: "stable",
        },
      },
    } as ReaderPromotionV2Candidate;

    expect(evaluateReaderPromotionV2(candidate)).toMatchObject({
      admitted: false,
      reasons: ["engagement_stale"],
    });
  });

  it("fails valid social metrics closed without durable authority", () => {
    const baseline = xPromotionCandidate({
      candidateId: "missing-metric-authority",
      likes: 89,
    });
    const candidate = {
      ...baseline,
      engagement: {
        state: "observed",
        authoritative: true,
        metrics: baseline.engagement.state === "observed"
          ? baseline.engagement.metrics
          : { provider: "x", likes: 89, reposts: 0 },
      },
    } as ReaderPromotionV2Candidate;

    expect(evaluateReaderPromotionV2(candidate)).toMatchObject({
      admitted: false,
      reasons: ["engagement_authority_missing"],
    });
  });

  it("rejects a metric refresh observed after the immutable cutoff", () => {
    const baseline = xPromotionCandidate({
      candidateId: "post-cutoff-refresh",
      likes: 11_112,
    });
    const candidate = {
      ...baseline,
      engagement: {
        ...baseline.engagement,
        authority: {
          source: "durable_projection",
          observedAt: "2026-08-29T18:00:00.001Z",
          regressionState: "stable",
        },
      },
    } as ReaderPromotionV2Candidate;

    expect(evaluateReaderPromotionV2(candidate)).toMatchObject({
      admitted: false,
      reasons: ["engagement_observed_after_cutoff"],
    });
  });

  it("admits a late authoritative refresh inside the cutoff-relative age", () => {
    const baseline = xPromotionCandidate({
      candidateId: "late-refresh",
      likes: 11_112,
    });
    const candidate = {
      ...baseline,
      engagement: {
        ...baseline.engagement,
        authority: {
          source: "durable_projection",
          observedAt: "2026-08-29T17:59:59.999Z",
          regressionState: "stable",
        },
      },
    } as ReaderPromotionV2Candidate;

    expect(evaluateReaderPromotionV2(candidate)).toMatchObject({
      admitted: true,
      engagementAttestation: {
        metricsObservedAt: "2026-08-29T17:59:59.999Z",
        freshnessCutoffAt: "2026-08-29T18:00:00.000Z",
      },
    });
  });

  it("admits a confirmed correction and rejects an unresolved regression", () => {
    const baseline = redditPromotionCandidate();
    const withRegressionState = (
      regressionState: "confirmed_correction" | "unresolved_regression",
    ) => ({
      ...baseline,
      candidateId: `regression-${regressionState}`,
      engagement: {
        ...baseline.engagement,
        authority: {
          source: "durable_projection",
          observedAt: "2026-08-29T17:30:00.000Z",
          regressionState,
        },
      },
    } as ReaderPromotionV2Candidate);

    expect(evaluateReaderPromotionV2(
      withRegressionState("confirmed_correction"),
    )).toMatchObject({
      admitted: true,
      engagementAttestation: { regressionState: "confirmed_correction" },
    });
    expect(evaluateReaderPromotionV2(
      withRegressionState("unresolved_regression"),
    )).toMatchObject({
      admitted: false,
      reasons: ["engagement_regression_unresolved"],
    });
  });

  it("binds metric observation, correction state, and cutoff in deterministic replay", () => {
    const candidate = xPromotionCandidate({
      candidateId: "authority-replay",
      likes: 89,
    });
    const first = evaluateReaderPromotionV2(candidate);
    const replay = evaluateReaderPromotionV2(candidate);

    expect(JSON.stringify(replay)).toBe(JSON.stringify(first));
    expect(first).toMatchObject({
      admitted: true,
      engagementAttestation: {
        authoritySource: "durable_projection",
        metricsObservedAt: "2026-08-29T17:00:00.000Z",
        freshnessCutoffAt: "2026-08-29T18:00:00.000Z",
        maximumAgeMs: 21_600_000,
        regressionState: "stable",
      },
    });
    if (first.admitted) {
      expect(first.digestInput).toContain(
        '"metricsObservedAt":"2026-08-29T17:00:00.000Z"',
      );
    }
  });
});
