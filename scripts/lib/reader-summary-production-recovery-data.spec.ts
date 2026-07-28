import { productionRecoveryBinding } from "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-production-recovery-authority.spec-support";

import {
  buildReaderSummaryProductionRecoveryPlan,
  dayAuthority,
  periodForRecoveryDate,
  readerSummaryProductionRecoveryDates,
  recoveryProvenanceForDay,
} from "./reader-summary-production-recovery-data";

describe("reader summary production recovery data", () => {
  it("binds only Jul24-Jul27 with two identical plan hashes per date", () => {
    const binding = productionRecoveryBinding();
    const plan = buildReaderSummaryProductionRecoveryPlan(binding);

    expect(readerSummaryProductionRecoveryDates).toEqual([
      "2026-07-24",
      "2026-07-25",
      "2026-07-26",
      "2026-07-27",
    ]);
    expect(plan.days).toHaveLength(4);
    expect(
      binding.days.every(
        (day) =>
          day.planSha256s[0] === day.canonicalSha256 &&
          day.planSha256s[1] === day.canonicalSha256,
      ),
    ).toBe(true);
    expect(
      plan.days.every(
        (day) =>
          day.providerCounts["hacker-news"] === 100 &&
          day.providerCounts.reddit === 100 &&
          day.githubMode === "verified_existing",
      ),
    ).toBe(true);
  });

  it("uses exact UTC periods and v2 immutable provenance", () => {
    const binding = productionRecoveryBinding();
    const period = periodForRecoveryDate("2026-07-27");
    const provenance = recoveryProvenanceForDay(binding, "2026-07-27");

    expect(period.startedAt.toISOString()).toBe(
      "2026-07-27T00:00:00.000Z",
    );
    expect(period.endedAt.toISOString()).toBe(
      "2026-07-28T00:00:00.000Z",
    );
    expect(provenance.regenerationInputManifest.sha256).toBe(
      dayAuthority(binding, "2026-07-27").canonicalSha256,
    );
    expect(provenance.priorCollectionProof.sourceAttempt.artifactFormat)
      .toBe("reader-summary-production-recovery-authority-v2");
  });
});
