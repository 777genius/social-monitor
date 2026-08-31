import { readFileSync } from "node:fs";
import { join } from "node:path";

import { canonicalizeReaderSummaryWeeklyJson } from
  "@social-monitor/summary/domain";
import {
  parseMigrationReceipt,
  parseRollbackAuthorityReceipt,
} from
  "../run-reader-summary-promotion-v2-rollback";

const migration = readFileSync(join(
  process.cwd(),
  "prisma/migrations/20260831120000_reader_summary_promotion_v2_rollback/migration.sql",
), "utf8");

describe("Promotion V2 publication-owner rollback", () => {
  it("atomically restores the superseded V1 lifecycle and preserves payloads", () => {
    expect(migration).toContain(
      'CREATE FUNCTION public."rollback_reader_summary_promotion_v2"',
    );
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("stale or replayed");
    expect(migration).toContain("current_publication_id\" = prior_v1_publication_id");
    expect(migration).toContain(
      "v_prior_artifact.\"status\" IS DISTINCT FROM 'SUPERSEDED'",
    );
    expect(migration).toContain(
      "SET \"status\" = v_prior.\"semantic_status\"",
    );
    expect(migration).toContain("SET \"status\" = 'SUPERSEDED'");
    expect(migration).not.toMatch(/DELETE FROM public\."reader_summary_/u);
  });

  it("admits only a complete V2 tuple and a strict readable V1 tuple", () => {
    expect(migration).toContain("reader_post_promotion_attestation.v2");
    expect(migration).toContain("reader_post_promotion_digest.sha256.v2");
    expect(migration).toContain("reader_summary.promotion_no_signal.v1");
    expect(migration).toContain("reader_post_promotion_attestation.v1");
    expect(migration).toContain("reader_post_promotion_digest.sha256.v1");
    expect(migration).toContain("legacyV1ReaderVerified");
    expect(migration).toContain(
      "reader_summary_promotion_v2_legacy_proof_matches",
    );
  });

  it("keeps mutation authority narrow and receipts immutable", () => {
    expect(migration).toContain(
      'TO "social_monitor_reader_summary_publication_runtime"',
    );
    expect(migration).toContain("rollback receipts are immutable");
    expect(migration).toContain("FORCE ROW LEVEL SECURITY");
  });

  it("records and admits a hash-bound pre-migration canary receipt", () => {
    expect(migration).toContain(
      'CREATE TRIGGER "reader_summary_promotion_v2_canary_receipt_recorded"',
    );
    expect(migration).toContain(
      'reader-summary-promotion-v2-canary-publication-receipt-v1',
    );
    expect(migration).toContain(
      "Promotion V2 rollback canary publication receipt mismatch",
    );
    const receipt = canaryReceipt();
    expect(parseRollbackAuthorityReceipt(Buffer.from(JSON.stringify(receipt))))
      .toMatchObject({ format: receipt.format, status: "published" });
    expect(() => parseRollbackAuthorityReceipt(Buffer.from(JSON.stringify({
      ...receipt,
      outputIdentity: {
        ...receipt.outputIdentity,
        reportSha256: "f".repeat(64),
      },
    })))).toThrow("canary receipt hash is invalid");
  });

  it("rejects unknown and hash-valid mixed canary authority", () => {
    const receipt = canaryReceipt();
    expect(() => parseRollbackAuthorityReceipt(Buffer.from(JSON.stringify({
      ...receipt,
      format: "reader-summary-promotion-v2-unknown-receipt-v1",
    })))).toThrow("migration receipt is incomplete");

    const { receiptSha256: _receiptSha256, ...body } = receipt;
    void _receiptSha256;
    const mixedBody = {
      ...body,
      outputIdentity: {
        ...body.outputIdentity,
        publicationId: "00000000-0000-4000-8000-000000000999",
      },
    };
    const mixed = {
      ...mixedBody,
      receiptSha256: canonicalizeReaderSummaryWeeklyJson(mixedBody).sha256,
    };
    expect(() => parseRollbackAuthorityReceipt(Buffer.from(
      JSON.stringify(mixed),
    ))).toThrow("current tuple is inconsistent");
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

const canaryReceipt = () => {
  const historical = completedReceipt();
  const body = {
    schemaVersion: 1,
    format: "reader-summary-promotion-v2-canary-publication-receipt-v1",
    date: historical.date,
    status: "published",
    publishedAt: "2026-08-01T12:00:00.000Z",
    outputIdentity: historical.outputIdentity,
    rollbackAuthority: historical.rollbackAuthority,
  } as const;
  return {
    ...body,
    receiptSha256: canonicalizeReaderSummaryWeeklyJson(body).sha256,
  };
};
