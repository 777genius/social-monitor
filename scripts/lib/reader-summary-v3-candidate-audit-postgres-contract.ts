import { deepStrictEqual } from "node:assert";
import { assertPostgresRejectsContaining as assertRejects } from
  "./reader-summary-publication-postgres-assertions";

interface CandidateAuditQueryPort {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    sql: string, values?: unknown[],
  ): Promise<{ rows: Row[] }>;
}

const id = (value: number): string =>
  `00000000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;

/** Representative metadata shape, not a reconstruction of lost model output. */
export const candidateAuditArtifactFixture = (): Record<string, unknown> => ({
  schemaVersion: "reader_summary.artifact.v1",
  promotionDiagnostics: {
    schemaVersion: "reader_promotion_diagnostics.v1",
    candidates: Array.from({ length: 1_220 }, (_, index) => ({
      candidateId: id(index), assessmentId: id(index + 2_000),
      selectionReason: "capacity_exhausted", presentationStatus: "pending",
      presentationAttempted: false,
    })),
  },
  dailyGenerationInput: {
    policyVersion: "reader_summary.daily_input.native_likes.v1",
    manifestSha256: "a".repeat(64), periodKey: "daily:fixture",
    cutoffAt: "2026-11-04T00:00:00.000000Z", candidateCount: 1_220,
    selected: Array.from({ length: 30 }, (_, index) => ({
      feedItemId: id(index), sourceItemId: id(index + 4_000),
      interestId: id(8_000), publishedAt: "2026-11-03T12:00:00.000000Z",
      observedAt: "2026-11-03T12:01:00.000000Z", assessmentId: id(index + 2_000),
      sourceSnapshotSha256: "b".repeat(64), inputSha256: "c".repeat(64),
      storyId: `fixture-story-${index}`, providerKey: "x-twitter",
      nativeCount: index, engagementObservedAt: "2026-11-03T12:01:00.000000Z",
    })),
    excluded: Array.from({ length: 1_190 }, (_, index) => ({
      feedItemId: id(index + 30), reason: "outside_input_limit",
    })),
  },
});

/** Direct owner-helper contract; publication authority/ACL tests remain separate. */
export const assertV3CandidateAuditPostgresContract = async (
  adminClient: CandidateAuditQueryPort,
): Promise<void> => {
  await adminClient.query("BEGIN");
  try {
    await adminClient.query(
      'SET LOCAL ROLE "social_monitor_reader_summary_publication_owner"');
    await assertV3CandidateAuditCanonicalCases(adminClient);
  } finally {
    await adminClient.query("ROLLBACK");
  }
};

/** Reusable inside a disposable transaction that installs a proposed function. */
export const assertV3CandidateAuditCanonicalCases = async (
  adminClient: CandidateAuditQueryPort,
): Promise<void> => {
  const canonical = async (value: unknown, profile = "artifact",
    strategy: string | null = "jev_primary_v3"): Promise<unknown> => {
    const result = await adminClient.query<{ readonly value: string }>(
      `SELECT public.reader_summary_v3_publication_canonical_json(
        $1::jsonb, $2::text, $3::text) AS value`,
      [JSON.stringify(value), strategy, profile]);
    return JSON.parse(result.rows[0]!.value) as unknown;
  };
  const reject = async (value: unknown, profile = "artifact",
    strategy: string | null = "jev_primary_v3",
    message = "structural bounds"): Promise<void> => {
    await adminClient.query("SAVEPOINT candidate_audit_rejection");
    await assertRejects(() => canonical(value, profile, strategy), message,
      "candidate audit structural profile unexpectedly admitted malformed input");
    await adminClient.query("ROLLBACK TO SAVEPOINT candidate_audit_rejection");
    await adminClient.query("RELEASE SAVEPOINT candidate_audit_rejection");
  };
  const artifact = candidateAuditArtifactFixture();
  deepStrictEqual(await canonical(artifact), artifact);
  const report = { artifactPayload: artifact };
  deepStrictEqual(await canonical(report, "report"), report);
  const ordinary = Array.from({ length: 1_025 }, () => null);
  await reject({ schemaVersion: "reader_summary.artifact.v1", unexpected: ordinary });
  await reject({ schemaVersion: "reader_summary.artifact.v1",
    wrapper: { promotionDiagnostics: { schemaVersion:
      "reader_promotion_diagnostics.v1", candidates: ordinary } } });
  await reject({ schemaVersion: "reader_summary.artifact.v1",
    promotionDiagnostics: { schemaVersion: "reader_promotion_diagnostics.v2",
      candidates: ordinary } });
  await reject({ schemaVersion: "reader_summary.artifact.v1",
    dailyGenerationInput: { policyVersion: "unrecognized", excluded: ordinary } });
  await reject({ schemaVersion: "reader_summary.artifact.v1",
    promotionDiagnostics: { schemaVersion: "reader_promotion_diagnostics.v1",
      candidates: [{ nested: ordinary }] } });
  await reject({ schemaVersion: "reader_summary.artifact.v1",
    promotionDiagnostics: { schemaVersion: "reader_promotion_diagnostics.v1",
      candidates: Array.from({ length: 20_001 }, () => null) } });
  await reject(artifact, "weekly");
  await reject(artifact, "artifact", null);
  let deep: unknown = null;
  for (let index = 0; index < 34; index += 1) deep = { child: deep };
  await reject({ schemaVersion: "reader_summary.artifact.v1", deep });
  await reject("x".repeat(64_001), "weekly");
  await reject({ schemaVersion: "reader_summary.artifact.v1",
    data: "x".repeat(16_777_217) }, "artifact", "jev_primary_v3", "byte bounds");
  // Exempt arrays' descendants still consume aggregate nodes and keys.
  await reject({ schemaVersion: "reader_summary.artifact.v1",
    promotionDiagnostics: { schemaVersion: "reader_promotion_diagnostics.v1",
      candidates: Array.from({ length: 5_000 }, () =>
        Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`key${index}`, null]))) } });
};
