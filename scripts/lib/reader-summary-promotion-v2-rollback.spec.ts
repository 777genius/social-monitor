import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseMigrationReceipt } from
  "../run-reader-summary-promotion-v2-rollback";

const migration = readFileSync(join(
  process.cwd(),
  "prisma/migrations/20260831120000_reader_summary_promotion_v2_rollback/migration.sql",
), "utf8");

describe("Promotion V2 publication-owner rollback", () => {
  it("is atomic, replay-proof and preserves both immutable artifacts", () => {
    expect(migration).toContain(
      'CREATE FUNCTION public."rollback_reader_summary_promotion_v2"',
    );
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("stale or replayed");
    expect(migration).toContain("current_publication_id\" = prior_v1_publication_id");
    expect(migration).not.toMatch(
      /UPDATE public\."reader_summary_artifacts"|DELETE FROM public\."reader_summary_/u,
    );
  });

  it("admits only a complete V2 tuple and a strict readable V1 tuple", () => {
    expect(migration).toContain("reader_post_promotion_attestation.v2");
    expect(migration).toContain("reader_post_promotion_digest.sha256.v2");
    expect(migration).toContain("reader_summary.promotion_no_signal.v1");
    expect(migration).toContain("reader_post_promotion_attestation.v1");
    expect(migration).toContain("reader_post_promotion_digest.sha256.v1");
    expect(migration).toContain("legacyV1ReaderVerified");
  });

  it("keeps mutation authority narrow and receipts immutable", () => {
    expect(migration).toContain(
      'TO "social_monitor_reader_summary_publication_runtime"',
    );
    expect(migration).toContain("rollback receipts are immutable");
    expect(migration).toContain("FORCE ROW LEVEL SECURITY");
  });

  it("rejects receipts whose mandatory verification gates are not proven", () => {
    const receipt = completedReceipt();
    expect(() => parseMigrationReceipt(Buffer.from(JSON.stringify({
      ...receipt,
      qualityGates: {
        ...receipt.qualityGates,
        apiOrderedLanesVerified: "not-exposed",
      },
    })))).toThrow("apiOrderedLanesVerified is not proven");
    expect(parseMigrationReceipt(Buffer.from(JSON.stringify(receipt))))
      .toMatchObject({ status: "completed" });
  });
});

const completedReceipt = () => ({
  schemaVersion: 1,
  format: "reader-summary-promotion-v2-historical-rebuild-receipt-v1",
  date: "2026-08-01",
  status: "completed",
  outputIdentity: {
    artifactId: "00000000-0000-4000-8000-000000000101",
    publicationId: "00000000-0000-4000-8000-000000000102",
    reportSha256: "a".repeat(64),
    proofSha256: "b".repeat(64),
  },
  rollbackAuthority: {
    priorPublicationId: "00000000-0000-4000-8000-000000000201",
    priorArtifactId: "00000000-0000-4000-8000-000000000202",
    priorReportSha256: "c".repeat(64),
    priorProofSha256: "d".repeat(64),
    expectedCurrentPublicationId: "00000000-0000-4000-8000-000000000102",
    expectedCurrentArtifactId: "00000000-0000-4000-8000-000000000101",
    expectedCurrentReportSha256: "a".repeat(64),
    expectedCurrentProofSha256: "b".repeat(64),
  },
  qualityGates: {
    artifactPromotionBoardValidated: true,
    citationsVerified: true,
    publicationProofVerified: true,
    apiPromotionTupleVerified: true,
    apiOrderedLanesVerified: true,
    siteReaderRouteHttp200Verified: true,
    siteFacingContractVerified: "not-exposed",
  },
});
