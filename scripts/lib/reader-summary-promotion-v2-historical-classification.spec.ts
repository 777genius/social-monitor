import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { JsonObject } from "@social-monitor/shared-kernel";

import {
  assertClosedUtcDate,
  classifyHistoricalPromotionAuthority,
  historicalPromotionRebuildIdentity,
  type HistoricalPromotionAuthorityInspection,
} from "./reader-summary-promotion-v2-historical-classification";

type Fixture = Readonly<{
  privacy: {
    synthetic: boolean;
    rawPostTextIncluded: boolean;
    rawProviderPayloadIncluded: boolean;
    credentialsIncluded: boolean;
  };
  cases: readonly Readonly<{
    expected: string;
    date: string;
    engagementSnapshotCount: number;
    engagementObservationByOriginalDayEndCount: number;
    rows: readonly Readonly<{
      feedItemId: string;
      providerKey: string;
      providerMetadata: JsonObject | null;
      publishedAt: string;
      observedAt: string;
      dayEndMetricProof: Readonly<{
        source: "observation" | "daily-rollup";
        observedAt: string;
        metrics: JsonObject;
      }> | null;
    }>[];
  }>[];
}>;

describe("historical Reader Promotion V2 classification", () => {
  const fixture = JSON.parse(readFileSync(join(
    process.cwd(),
    "ops/evals/reader-summary-promotion-v2-historical-classification-fixture.v1.json",
  ), "utf8")) as Fixture;

  it("keeps the deterministic eval fixture privacy-safe", () => {
    expect(fixture.privacy).toEqual({
      synthetic: true,
      rawPostTextIncluded: false,
      rawProviderPayloadIncluded: false,
      credentialsIncluded: false,
    });
    expect(JSON.stringify(fixture)).not.toMatch(
      /api[_-]?key|password|bearer|authorization|bodyPreview|canonicalUrl/iu,
    );
  });

  it.each(fixture.cases)("classifies $date as $expected", (scenario) => {
    const classification = classifyHistoricalPromotionAuthority({
      date: scenario.date,
      inspection: scenario as HistoricalPromotionAuthorityInspection,
    });

    expect(classification.kind).toBe(scenario.expected);
    expect(classification.authorityInspectionDigest).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("records current-authority and malformed-provider limitations honestly", () => {
    const scenario = fixture.cases[1]!;
    const classification = classifyHistoricalPromotionAuthority({
      date: scenario.date,
      inspection: scenario as HistoricalPromotionAuthorityInspection,
    });

    expect(classification).toMatchObject({
      kind: "rebuildable-from-authoritative-input",
      structurallyValidRowCount: 1,
      structurallyValidByOriginalDayEndCount: 0,
      engagementSnapshotCount: 0,
    });
    expect(classification.providerLimitations).toEqual([
      {
        providerKey: "reddit",
        reason: "day_end_metric_value_mismatch",
        rowCount: 1,
      },
      {
        providerKey: "x-twitter",
        reason: "malformed_metadata",
        rowCount: 1,
      },
    ]);
  });

  it("does not confuse an old feed timestamp with exact late-refreshed metrics", () => {
    const classification = classifyHistoricalPromotionAuthority({
      date: "2026-08-01",
      inspection: {
        engagementSnapshotCount: 1,
        engagementObservationByOriginalDayEndCount: 1,
        rows: [{
          feedItemId: "00000000-0000-4000-8000-000000000999",
          providerKey: "reddit",
          providerMetadata: {
            kind: "reddit_post", score: 120, upvoteRatio: 0.9,
          },
          publishedAt: "2026-08-01T08:00:00.000Z",
          observedAt: "2026-08-01T08:05:00.000Z",
          dayEndMetricProof: {
            source: "observation",
            observedAt: "2026-08-01T23:00:00.000Z",
            metrics: { score: 80, upvoteRatioBps: 9000 },
          },
        }],
      },
    });
    expect(classification.kind).toBe(
      "rebuildable-from-authoritative-input",
    );
    expect(classification.providerLimitations).toContainEqual({
      providerKey: "reddit",
      reason: "day_end_metric_value_mismatch",
      rowCount: 1,
    });
  });

  it("binds identity to date, authoritative digest, and V2 policy", () => {
    const digest = "a".repeat(64);
    const identity = historicalPromotionRebuildIdentity({
      date: "2026-08-01",
      authoritativeInputDigest: digest,
    });

    expect(identity).toBe(historicalPromotionRebuildIdentity({
      date: "2026-08-01",
      authoritativeInputDigest: digest,
      policyVersion: "reader_post_promotion.v2",
    }));
    expect(identity).not.toBe(historicalPromotionRebuildIdentity({
      date: "2026-08-02",
      authoritativeInputDigest: digest,
    }));
    expect(() => historicalPromotionRebuildIdentity({
      date: "2026-08-01",
      authoritativeInputDigest: digest,
      policyVersion: "reader_post_promotion.v1",
    })).toThrow("policy version is not V2");
  });

  it("rejects today and future/open UTC dates", () => {
    expect(() => assertClosedUtcDate(
      "2026-08-31",
      new Date("2026-08-31T22:00:00.000Z"),
    )).toThrow("not a closed UTC date");
    expect(() => assertClosedUtcDate(
      "2026-09-01",
      new Date("2026-08-31T22:00:00.000Z"),
    )).toThrow("not a closed UTC date");
  });

});
