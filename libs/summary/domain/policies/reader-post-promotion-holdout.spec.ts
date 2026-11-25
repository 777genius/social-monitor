import { evaluateReaderPostPromotion } from "./reader-post-promotion-policy";
import { selectReaderPostPromotions } from
  "./reader-post-promotion-selection";
import {
  githubRadarMetrics,
  hackerNewsMetrics,
  promotionInput,
  redditMetrics,
  xMetrics,
} from "./reader-post-promotion-policy.spec-support";
import { readerPostPromotionV1Holdout } from
  "./reader-post-promotion-v1-holdout";

describe("Promotion V1 independently labeled holdout", () => {
  it.each(readerPostPromotionV1Holdout)("matches $id", (sample) => {
    const input = promotionInput(sample.provider === "x"
      ? { metrics: xMetrics(sample.likes, sample.reposts) }
      : sample.provider === "reddit"
        ? {
            provider: "reddit",
            metrics: redditMetrics(
              sample.score,
              "ratio" in sample ? sample.ratio : undefined,
            ),
          }
        : sample.provider === "hacker_news"
          ? {
              provider: "hacker_news",
              contentKind: "story",
              metrics: hackerNewsMetrics(sample.points),
            }
          : {
              provider: "github_radar",
              contentKind: "repository",
              metrics: githubRadarMetrics({
                hours: sample.hours,
                delta: sample.delta,
              }),
            });
    expect(evaluateReaderPostPromotion(input).decision).toBe(sample.expected);
  });

  it("kills constant evaluators and one-step threshold mutations", () => {
    const decisions = readerPostPromotionV1Holdout.map((sample) =>
      sample.expected,
    );
    expect(new Set(decisions)).toEqual(new Set([
      "reject",
      "promote_additional",
      "promote_top",
    ]));
    for (const [below, exact] of [
      ["x-top-minus-one", "x-top-exact"],
      ["x-additional-minus-one", "x-additional-exact"],
      ["reddit-trusted-ratio-below", "reddit-trusted-ratio-exact"],
      ["hn-additional-minus-one", "hn-additional-exact"],
      ["github-48h-top-minus-one", "github-48h-top-exact"],
    ] as const) {
      const left = readerPostPromotionV1Holdout.find((item) => item.id === below)!;
      const right = readerPostPromotionV1Holdout.find((item) => item.id === exact)!;
      expect(left.expected).not.toBe(right.expected);
    }
  });

  it("kills safety, freshness, identity, kind, and attestation-bypass mutations", () => {
    const valid = promotionInput({
      authorityAttestation: {
        status: "attested",
        official: true,
        trusted: true,
        attestedBy: "source_catalog",
      },
      metrics: xMetrics(0, 0),
    });
    for (const [override, reason] of [
      [{ safetyValid: false }, "safety_gate_failed"],
      [{ freshnessValid: false }, "stale_evidence"],
      [{ canonicalIdentity: "" }, "canonical_identity_missing"],
      [{ contentKind: "reply" }, "non_original_content"],
      [{ metrics: xMetrics(Number.NaN, 0) }, "metrics_malformed"],
    ] as const) {
      expect(evaluateReaderPostPromotion({ ...valid, ...override })).toMatchObject({
        decision: "reject",
        reason,
      });
    }
  });

  it("does not let official authority bypass the independent support floor", () => {
    const support = promotionInput({
      authorityAttestation: {
        status: "attested",
        official: true,
        trusted: true,
        attestedBy: "source_catalog",
      },
      metrics: xMetrics(0, 0),
      relation: {
        kind: "same_story",
        targetCanonicalIdentity: "story:independent-lead",
        confidence: 0.92,
        approved: true,
      },
    });

    expect(evaluateReaderPostPromotion(support)).toMatchObject({
      decision: "reject",
      reason: "engagement_floor_not_met",
    });
    expect(evaluateReaderPostPromotion({
      ...support,
      metrics: xMetrics(15, 10),
    })).toMatchObject({
      decision: "support_only",
      reason: "authoritative_same_story_support",
    });
  });

  it("kills input-order selection mutations", () => {
    const weaker = promotionInput({
      candidateId: "weaker-top",
      canonicalIdentity: "story:weaker-top",
      citationId: "citation:weaker-top",
      metrics: xMetrics(30, 20),
    });
    const stronger = promotionInput({
      candidateId: "stronger-top",
      canonicalIdentity: "story:stronger-top",
      citationId: "citation:stronger-top",
      metrics: xMetrics(100, 40),
    });

    for (const inputs of [[weaker, stronger], [stronger, weaker]]) {
      expect(selectReaderPostPromotions(inputs).top.map((item) =>
        item.candidate.candidateId,
      )).toEqual(["stronger-top", "weaker-top"]);
    }
  });
});
