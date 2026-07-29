import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  canonicalizeReaderSummaryProductionRecoveryJson,
  canonicalizeReaderSummaryWeeklyJson,
  readerSummaryProductionRecoveryCanonicalJsonLimits,
  readerSummaryWeeklyCanonicalJsonLimits,
} from "@social-monitor/summary/domain/value-objects/reader-summary-weekly-canonical-json";
import {
  assertReaderSummaryProductionRecoveryPostgresContract,
  seedReaderSummaryProductionRecoveryFixture,
} from "./reader-summary-production-recovery-postgres-contract";

describe("reader summary production recovery PostgreSQL contract", () => {
  const validationMigration = readFileSync(
    join(
      process.cwd(),
      "prisma/migrations/" +
        "20260729162000_reader_summary_production_recovery_validate_v2/" +
        "migration.sql",
    ),
    "utf8",
  );
  const canonicalBoundsMigration = readFileSync(
    join(
      process.cwd(),
      "prisma/migrations/" +
        "20260729183000_reader_summary_production_recovery_" +
        "evidence_canonical_bounds/migration.sql",
    ),
    "utf8",
  );

  it("exports the real DB fixture and concurrency contract", () => {
    expect(seedReaderSummaryProductionRecoveryFixture).toBeInstanceOf(
      Function,
    );
    expect(assertReaderSummaryProductionRecoveryPostgresContract)
      .toBeInstanceOf(Function);
  });

  it("replaces only validation with the exact six-day v2 authority", () => {
    expect(validationMigration).toContain(
      'CREATE OR REPLACE FUNCTION\n"validate_reader_summary_production_recovery"',
    );
    expect(validationMigration).not.toContain(
      'CREATE OR REPLACE FUNCTION "prepare_reader_summary_production_recovery"',
    );
    expect(validationMigration).toContain(
      "reader_summary.production_recovery_authority.v2",
    );
    expect(validationMigration).toContain(
      "reader_summary.production_recovery.v2:",
    );
    expect(validationMigration).toContain(
      '"reader_summary_production_recovery_expected_counts_v2"',
    );
    for (const date of [
      "2026-07-23",
      "2026-07-24",
      "2026-07-25",
      "2026-07-26",
      "2026-07-27",
      "2026-07-28",
    ]) {
      expect(validationMigration).toContain(`'${date}'`);
    }
    expect(validationMigration).not.toMatch(
      /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b/iu,
    );
    expect(validationMigration).not.toMatch(
      /\b(?:WHERE|AND|OR|ORDER BY)\s+"(?:id|recovery_id|tenant_id|workspace_id)"/iu,
    );
    expect(validationMigration).not.toMatch(/\bOR\s+CASE\b/iu);
    expect(
      validationMigration.match(/\bOR\s+\(\s*CASE\b[\s\S]*?\bEND\s*\)/giu),
    ).toHaveLength(2);
  });

  it("keeps shared publication bounds and admits real-shaped recovery rows", () => {
    const evidence = Array.from({ length: 350 }, (_, index) =>
      productionRecoveryEvidence(index),
    );
    const artifact = {
      schemaVersion: "reader_summary.production_recovery_evidence.v2",
      sourceEvidence: evidence,
    };

    expect(() => canonicalizeReaderSummaryWeeklyJson(artifact)).toThrow(
      "total object key limit",
    );
    const first = canonicalizeReaderSummaryProductionRecoveryJson(artifact);
    const repeated = canonicalizeReaderSummaryProductionRecoveryJson(
      JSON.parse(JSON.stringify(artifact)) as unknown,
    );
    expect(first.sha256).toBe(repeated.sha256);
    expect(first.byteLength).toBeLessThanOrEqual(
      readerSummaryWeeklyCanonicalJsonLimits.maxBytes,
    );
  });

  it("fails closed one total object key above the recovery-only bound", () => {
    const atLimit = totalObjectKeyFixture(
      readerSummaryProductionRecoveryCanonicalJsonLimits.maxTotalObjectKeys,
    );
    const aboveLimit = totalObjectKeyFixture(
      readerSummaryProductionRecoveryCanonicalJsonLimits.maxTotalObjectKeys +
        1,
    );

    expect(
      canonicalizeReaderSummaryProductionRecoveryJson(atLimit).byteLength,
    ).toBeGreaterThan(0);
    expect(() =>
      canonicalizeReaderSummaryProductionRecoveryJson(aboveLimit),
    ).toThrow("total object key limit");
  });

  it("installs a recovery-only DB canonicalizer for evidence hashes", () => {
    expect(canonicalBoundsMigration).toContain(
      '"reader_summary_production_recovery_canonical_json"',
    );
    expect(canonicalBoundsMigration).toContain("v_object_keys > 5700");
    expect(canonicalBoundsMigration).toContain("v_nodes > 6000");
    expect(canonicalBoundsMigration).toContain("v_bytes > 1048576");
    expect(canonicalBoundsMigration).toContain(
      "v_definition,\n    v_shared_call,\n    v_recovery_call",
    );
    expect(canonicalBoundsMigration).not.toContain(
      "CREATE OR REPLACE FUNCTION public.reader_summary_weekly_canonical_json",
    );
  });
});

const productionRecoveryEvidence = (
  index: number,
): Readonly<Record<string, string | null>> => ({
  providerKey: "x-twitter",
  feedItemId: `10000000-0000-4000-8000-${suffix(index)}`,
  sourceItemId: `20000000-0000-4000-8000-${suffix(index)}`,
  sourceBindingId: "30000000-0000-4000-8000-000000000001",
  interestId: "60000000-0000-4000-8000-000000000001",
  providerItemId: `x-twitter:${index}`,
  canonicalUrl: `https://evidence.invalid/${index}`,
  title: `Evidence ${index}`,
  bodyPreview: `Preview ${index}`,
  sourceText: `Immutable source text ${index}`,
  authorHandle: `author-${index}`,
  sourceContentHash: index.toString(16).padStart(64, "0"),
  sourceProviderContentHash: null,
  publishedAt: "2026-07-24T12:00:00.000Z",
  observedAt: "2026-07-24T12:01:00.000Z",
});

const totalObjectKeyFixture = (
  keyCount: number,
): readonly Readonly<Record<string, null>>[] =>
  Array.from(
    { length: Math.ceil(keyCount / 64) },
    (_unused, objectIndex) =>
      Object.fromEntries(
        Array.from(
          {
            length: Math.min(64, keyCount - objectIndex * 64),
          },
          (_entry, keyIndex) => [
            `key-${objectIndex * 64 + keyIndex}`,
            null,
          ],
        ),
      ),
  );

const suffix = (index: number): string =>
  (index + 1).toString().padStart(12, "0");
