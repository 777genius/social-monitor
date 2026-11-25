import { exactProductionRecoveryBinding as productionRecoveryBinding } from "./reader-summary-production-recovery-exact.spec-support";

import {
  buildReaderSummaryProductionRecoveryPlan,
  dayAuthority,
  periodForRecoveryDate,
  readerSummaryProductionRecoveryDates,
  recoveryGapProvenanceForDay,
  recoveryProvenanceForDay,
} from "./reader-summary-production-recovery-data";
import type { ReaderSummaryProductionRecoveryGapAuthorityBinding } from "./reader-summary-production-recovery-gap-authority";
import { readerSummaryProductionRecoveryModelContract } from "./reader-summary-production-recovery-model-contract";

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
        counts: Object.values(day.providerCounts),
      })),
    ).toEqual([
      {
        date: "2026-07-23",
        total: 342,
        githubMode: "historical_unavailable",
        counts: [0, 100, 100, 75, 67],
      },
      {
        date: "2026-07-24",
        total: 350,
        githubMode: "verified_existing",
        counts: [10, 100, 100, 67, 73],
      },
      {
        date: "2026-07-25",
        total: 369,
        githubMode: "verified_existing",
        counts: [10, 100, 100, 63, 96],
      },
      {
        date: "2026-07-26",
        total: 344,
        githubMode: "verified_existing",
        counts: [10, 78, 100, 62, 94],
      },
      {
        date: "2026-07-27",
        total: 301,
        githubMode: "verified_existing",
        counts: [10, 87, 99, 47, 58],
      },
      {
        date: "2026-07-28",
        total: 138,
        githubMode: "historical_unavailable",
        counts: [0, 0, 0, 31, 107],
      },
    ]);
    expect(plan.days[5]).toMatchObject({
      requestedUtcDate: "2026-07-28",
      dominanceRatioBasisPoints: 7753,
      modelEligible: false,
      terminalOutcome: "UNAVAILABLE",
    });
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

  it("binds gap provenance only to immutable v3 authority hashes", () => {
    const binding = {
      schemaVersion: "reader_summary.production_recovery_gap_authority.v3",
      canonicalSha256: "a".repeat(64),
      modelContract: readerSummaryProductionRecoveryModelContract,
      days: [{
        requestedUtcDate: "2026-07-29",
        period: {
          startedAt: "2026-07-29T00:00:00.000Z",
          endedAt: "2026-07-30T00:00:00.000Z",
          timezone: "UTC",
        },
        canonicalSha256: "b".repeat(64),
        providerEvidenceSha256: "c".repeat(64),
      }],
    } as unknown as ReaderSummaryProductionRecoveryGapAuthorityBinding;

    const provenance = recoveryGapProvenanceForDay(binding, "2026-07-29");
    expect(provenance.priorCollectionProof.sourceAttempt.sha256).toBe(
      "a".repeat(64),
    );
    expect(provenance.priorCollectionProof.collectionArtifact.sha256).toBe(
      "b".repeat(64),
    );
    expect(provenance.regenerationInputManifest.datasetSha256).toBe(
      "c".repeat(64),
    );
  });
});
