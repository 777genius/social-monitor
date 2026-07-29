import { productionRecoveryBinding } from "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-production-recovery-authority.spec-support";

import {
  buildReaderSummaryProductionRecoveryPlan,
  dayAuthority,
  periodForRecoveryDate,
  readerSummaryProductionRecoveryDates,
  recoveryProvenanceForDay,
} from "./reader-summary-production-recovery-data";

describe("reader summary production recovery data", () => {
  it("binds Jul23-Jul28 DB counts and two hashes per date", () => {
    const binding = productionRecoveryBinding();
    const plan = buildReaderSummaryProductionRecoveryPlan(binding);

    expect(readerSummaryProductionRecoveryDates).toEqual([
      "2026-07-23",
      "2026-07-24",
      "2026-07-25",
      "2026-07-26",
      "2026-07-27",
      "2026-07-28",
    ]);
    expect(plan.days).toHaveLength(6);
    expect(
      binding.days.every(
        (day) =>
          day.planSha256s[0] === day.canonicalSha256 &&
          day.planSha256s[1] === day.canonicalSha256,
      ),
    ).toBe(true);
    expect(
      plan.days.map((day) => ({
        date: day.requestedUtcDate,
        total: day.totalEvidenceCount,
        githubMode: day.githubMode,
      })),
    ).toEqual([
      {
        date: "2026-07-23",
        total: 345,
        githubMode: "historical_unavailable",
      },
      {
        date: "2026-07-24",
        total: 351,
        githubMode: "verified_existing",
      },
      {
        date: "2026-07-25",
        total: 369,
        githubMode: "verified_existing",
      },
      {
        date: "2026-07-26",
        total: 344,
        githubMode: "verified_existing",
      },
      {
        date: "2026-07-27",
        total: 301,
        githubMode: "verified_existing",
      },
      {
        date: "2026-07-28",
        total: 56,
        githubMode: "historical_unavailable",
      },
    ]);
  });

  it("uses exact UTC periods and v2 immutable provenance", () => {
    const binding = productionRecoveryBinding();
    const period = periodForRecoveryDate("2026-07-26");
    const provenance = recoveryProvenanceForDay(binding, "2026-07-26");

    expect(period.startedAt.toISOString()).toBe(
      "2026-07-26T00:00:00.000Z",
    );
    expect(period.endedAt.toISOString()).toBe(
      "2026-07-27T00:00:00.000Z",
    );
    expect(provenance.regenerationInputManifest.sha256).toBe(
      dayAuthority(binding, "2026-07-26").canonicalSha256,
    );
    expect(provenance.priorCollectionProof.sourceAttempt.artifactFormat)
      .toBe("reader-summary-production-recovery-authority-v2");
  });
});
