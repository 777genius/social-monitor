import assert from "node:assert/strict";
import test from "node:test";

import { validHistoricalRegenerationSourceAuthority } from
  "./reader-summary-production-day-regeneration-source-authority.mjs";

test("accepts the complete preserved production-day evidence authority", () => {
  const provenance = {
    priorCollectionProof: {
      sourceAttempt: {
        artifactFormat: "reader-summary-production-day-run-v1",
        sha256: "a".repeat(64),
      },
      collectionArtifact: {
        artifactFormat: "reader-summary-clean-real-day-collection-v1",
        sha256: "b".repeat(64),
      },
      collectionQualityReport: {
        artifactFormat: "yesterday-social-collection-quality-report-v1",
        sha256: "c".repeat(64),
      },
    },
    activeSourcePublicationProof: null,
  };

  assert.equal(validHistoricalRegenerationSourceAuthority(provenance), true);
  provenance.priorCollectionProof.collectionArtifact.sha256 = "invalid";
  assert.equal(validHistoricalRegenerationSourceAuthority(provenance), false);
});

test("accepts only the exact active-publication proof bound to Promotion V2", () => {
  const publicationId = "00000000-0000-4000-8000-000000000301";
  const artifactId = "00000000-0000-4000-8000-000000000302";
  const provenance = {
    priorCollectionProof: null,
    activeSourcePublicationProof: {
      artifactFormat: "reader-summary-active-database-publication-v1",
      publicationId,
      artifactId,
      reportSha256: "d".repeat(64),
      proofSha256: "e".repeat(64),
    },
    promotionRebuild: {
      sourceAuthorityKind: "active-database-publication",
      sourcePublicationId: publicationId,
      sourceArtifactId: artifactId,
      sourcePublicationReportSha256: "d".repeat(64),
      sourcePublicationProofSha256: "e".repeat(64),
    },
  };

  assert.equal(validHistoricalRegenerationSourceAuthority(provenance), true);
  provenance.promotionRebuild.sourcePublicationProofSha256 = "f".repeat(64);
  assert.equal(validHistoricalRegenerationSourceAuthority(provenance), false);
});
