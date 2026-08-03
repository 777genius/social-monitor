import { canonicalizeReaderSummaryWeeklyJson } from "@social-monitor/summary/domain";

import {
  buildReaderSummaryProductionRecoveryGapPlan,
} from "./reader-summary-production-recovery-gap-authority";
import {
  exactRecoveryGapRows,
  recoveryGapEvidenceRow,
  recoveryGapFixtureScope as scope,
} from "./reader-summary-production-recovery-gap.spec-support";

describe("reader summary production recovery gap authority", () => {
  it("produces byte-identical canonical plans through independent grouping paths", () => {
    const rows = exactRecoveryGapRows();
    const first = buildReaderSummaryProductionRecoveryGapPlan({
      scope,
      rows,
      producer: "ordered_filter",
    });
    const second = buildReaderSummaryProductionRecoveryGapPlan({
      scope,
      rows: [...rows],
      producer: "grouped_reduce",
    });

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(canonicalizeReaderSummaryWeeklyJson(first).sha256).toBe(
      canonicalizeReaderSummaryWeeklyJson(second).sha256,
    );
    expect(first).toMatchObject({
      schemaVersion: "reader_summary.production_recovery_gap_authority.v3",
      requestedUtcDates: ["2026-07-29", "2026-07-30", "2026-07-31"],
      boundaries: {
        stage: "pre_model",
        modelCallPerformed: false,
        publicationPerformed: false,
        recollectionPerformed: false,
        providerWritePerformed: false,
      },
    });
    expect((first.days as readonly Record<string, unknown>[]).every(
      (day) => !(day.modelEligibility as { eligible: boolean }).eligible,
    )).toBe(true);
  });

  it("seals exact missing coverage as truthful terminal partial days", () => {
    const plan = buildReaderSummaryProductionRecoveryGapPlan({
      scope,
      rows: exactRecoveryGapRows(),
      producer: "ordered_filter",
    });
    expect(plan.days.map((day) => ({
      date: day.requestedUtcDate,
      total: day.dominance.totalEvidenceCount,
      counts: day.providerCoverage.map((coverage) => coverage.count),
    }))).toEqual([
      { date: "2026-07-29", total: 59, counts: [10, 0, 0, 32, 17] },
      { date: "2026-07-30", total: 98, counts: [0, 0, 0, 34, 64] },
      { date: "2026-07-31", total: 57, counts: [10, 0, 0, 32, 15] },
    ]);
    expect(plan.days).toEqual(expect.arrayContaining([
      expect.objectContaining({
        requestedUtcDate: "2026-07-29",
        modelEligibility: expect.objectContaining({ eligible: false }),
        terminalOutcome: expect.objectContaining({ status: "PARTIAL" }),
      }),
      expect.objectContaining({
        requestedUtcDate: "2026-07-30",
        modelEligibility: {
          eligible: false,
          reasons: [
            "provider_github-trending-page_missing",
            "provider_hacker-news_missing",
            "provider_reddit_missing",
          ],
          evaluatedAgainst: "immutable_db_evidence",
        },
        terminalOutcome: expect.objectContaining({ status: "PARTIAL" }),
      }),
      expect.objectContaining({
        requestedUtcDate: "2026-07-31",
        modelEligibility: expect.objectContaining({ eligible: false }),
        terminalOutcome: expect.objectContaining({ status: "PARTIAL" }),
      }),
    ]));
  });

  it.each([
    ["observedAt", "feed observed_at"],
    ["createdAt", "feed created_at"],
    ["sourceObservedAt", "source observed_at"],
    ["sourceCreatedAt", "canonical ingestion time"],
  ] as const)("rejects published-at-only backdating through %s", (field, label) => {
    const rows = exactRecoveryGapRows();
    const late = recoveryGapEvidenceRow("2026-07-29", "rss", 990_001);
    expect(() => buildReaderSummaryProductionRecoveryGapPlan({
      scope,
      rows: [...rows.slice(0, -1), {
        ...late,
        publishedAt: new Date("2026-07-29T01:00:00.000Z"),
        [field]: new Date("2026-08-01T21:30:00.001Z"),
      }],
      producer: "grouped_reduce",
    })).toThrow(`${label} exceeds immutable authority cutoff`);
  });

  it("records bounded GitHub omission when historical scan proof is unavailable", () => {
    const rows = exactRecoveryGapRows().map((row) =>
      row.requestedUtcDate === "2026-07-29" &&
      row.providerKey === "github-trending-page"
        ? { ...row, githubResultId: null }
        : row,
    );
    const plan = buildReaderSummaryProductionRecoveryGapPlan({
      scope,
      rows,
      producer: "ordered_filter",
    });
    const day = plan.days[0]!;
    expect(day.providerCoverage[0]).toMatchObject({
      providerKey: "github-trending-page",
      count: 0,
      evidenceState: "unavailable",
    });
    expect(day.modelEligibility.eligible).toBe(false);
    expect(day.modelEligibility.reasons).toContain(
      "provider_github-trending-page_unavailable",
    );
  });
});
