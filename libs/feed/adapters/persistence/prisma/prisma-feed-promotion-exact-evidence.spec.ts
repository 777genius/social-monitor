import {
  buildSourceEngagementMetrics,
  engagementMetricsHaveRegression,
} from "@social-monitor/ingestion/domain";

import { evaluateReaderPromotionV2 } from
  "../../../domain/policies/reader-promotion-policy-v2";
import { hackerNewsPromotionCandidate, redditPromotionCandidate } from
  "../../../domain/policies/reader-promotion-policy-v2.spec-fixtures";
import type { PrismaFeedClient } from "./prisma-feed-client";
import { exactPromotionPageEvidence } from "./prisma-feed-promotion-exact-evidence";

const beforeAt = "2026-08-29T17:00:00.000Z";
const fallAt = "2026-08-29T17:15:00.000Z";
const cutoff = new Date("2026-08-29T18:00:00.000Z");
const id = "00000000-0000-7000-8000-000000000001";
const authorityRow = () => ({
  id, sourceItemId: "fixture-source", body: "Fixture story",
  publishedAt: beforeAt, observedAt: beforeAt, observedThrough: true,
  engagementObservedAt: fallAt, engagementChangedAt: fallAt,
  engagementMetricsHash: "lower", currentHasRegressionFromLatest: true,
  latestObservationAt: beforeAt, latestObservationMetricsHash: "before",
  latestObservationHasRegression: false,
  previousObservationAt: null, previousObservationMetricsHash: null,
  previousObservationHasRegression: null,
});
const queryClient = (rows: readonly unknown[]) => {
  const query = jest.fn().mockResolvedValue(rows);
  return { query, client: { $queryRawUnsafe: query } as unknown as PrismaFeedClient };
};

describe("exact promotion comment regression authority", () => {
  it("selects both comment columns and compares nullable pairs without zero defaults", async () => {
    const { query, client } = queryClient([]);
    await exactPromotionPageEvidence(client, [id], cutoff);
    expect(query).toHaveBeenCalledWith(expect.any(String), [id], cutoff);
    const sql = String(query.mock.calls[0]?.[0]).replace(/\s+/gu, " ");
    expect(sql).toContain(
      "COALESCE(engagement.comments < latest_observation.comments, false)",
    );
    expect(sql).toContain(
      "COALESCE( latest_observation.comments < previous_observation.comments, false )",
    );
    const lateralSelects = sql.split("LEFT JOIN LATERAL (").slice(1);
    expect(lateralSelects).toHaveLength(2);
    for (const lateral of lateralSelects) {
      expect(lateral.split("FROM source_item_engagement_observations")[0])
        .toContain("observation.comments,");
    }
    expect(sql).toContain("latest_observation.has_regression OR COALESCE(");
    expect(sql).toContain("latest_observation.observed_at IS NULL THEN NULL");
  });

  describe.each(["hacker-news", "reddit"] as const)("%s", (providerKey) => {
    const metrics = (comments: number | undefined) => {
      const result = buildSourceEngagementMetrics({
        providerKey,
        metadata: providerKey === "hacker-news"
          ? { kind: "hacker_news_story", points: 73,
              ...(comments === undefined ? {} : { comments }) }
          : { kind: "reddit_post", score: 64, upvoteRatio: 0.81,
              ...(comments === undefined ? {} : { numComments: comments }) },
      });
      if (result.metrics === null) throw new Error("Invalid fixture metrics");
      return result;
    };

    it.each([
      [9, 3, true], [9, 0, true], [9, 9, false], [9, 12, false],
      [undefined, 0, false], [9, undefined, false],
      [undefined, undefined, false],
    ] as const)("preserves presence semantics: %s -> %s", (before, after, expected) => {
      expect(engagementMetricsHaveRegression({
        previous: metrics(before).metrics!, current: metrics(after).metrics!,
      })).toBe(expected);
    });

    it.each([false, true])("rejects a first comment-only fall, cadence due=%s", async (due) => {
      const previous = metrics(9);
      const current = metrics(3);
      const regression = engagementMetricsHaveRegression({
        previous: previous.metrics!, current: current.metrics!,
      });
      expect(regression).toBe(true);
      expect(current.metrics?.comments).toBe(3);
      expect(current.metricsFingerprint).not.toBe(previous.metricsFingerprint);
      // Row mapping/policy test only: SQL execution is the parent's native gate.
      const { client } = queryClient([{
        ...authorityRow(),
        engagementMetricsHash: current.metricsFingerprint,
        currentHasRegressionFromLatest: due ? false : regression,
        latestObservationAt: due ? fallAt : beforeAt,
        latestObservationMetricsHash: due
          ? current.metricsFingerprint : previous.metricsFingerprint,
        latestObservationHasRegression: due ? regression : false,
      }]);
      const authority = (await exactPromotionPageEvidence(client, [id], cutoff))
        .get(id)?.metricAuthority;
      expect(authority?.regressionState).toBe("unresolved_regression");
      const candidate = providerKey === "hacker-news"
        ? hackerNewsPromotionCandidate() : redditPromotionCandidate();
      expect(evaluateReaderPromotionV2(candidate)).toMatchObject({ admitted: true });
      if (candidate.engagement.state !== "observed" || authority === undefined) {
        throw new Error("Missing fixture authority");
      }
      expect(evaluateReaderPromotionV2({
        ...candidate,
        engagement: { ...candidate.engagement, authority: {
          source: "durable_projection", observedAt: authority.observedAt.toISOString(),
          regressionState: authority.regressionState,
        } },
      })).toMatchObject({
        admitted: false, reasons: ["engagement_regression_unresolved"],
      });
    });
  });

  it("preserves confirmation of a repeated lower snapshot inside cadence", async () => {
    const { client } = queryClient([{
      ...authorityRow(), engagementObservedAt: "2026-08-29T17:20:00.000Z",
    }]);
    const evidence = await exactPromotionPageEvidence(client, [id], cutoff);
    expect(evidence.get(id)?.metricAuthority?.regressionState)
      .toBe("confirmed_correction");
  });

  it("fails closed when durable comparison evidence is absent", async () => {
    const { client } = queryClient([{
      ...authorityRow(), currentHasRegressionFromLatest: null,
    }]);
    expect((await exactPromotionPageEvidence(client, [id], cutoff))
      .get(id)?.metricAuthority).toBeUndefined();
  });
});
