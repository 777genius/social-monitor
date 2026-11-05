export function validHistoricalRegenerationSourceAuthority(provenance) {
  const prior = provenance.priorCollectionProof;
  if (prior !== null && typeof prior === "object") {
    return provenance.activeSourcePublicationProof === null &&
      hashBoundArtifactMatches(
        prior.sourceAttempt,
        "reader-summary-production-day-run-v1",
      ) &&
      hashBoundArtifactMatches(
        prior.collectionArtifact,
        "reader-summary-clean-real-day-collection-v1",
      ) &&
      hashBoundArtifactMatches(
        prior.collectionQualityReport,
        "yesterday-social-collection-quality-report-v1",
      );
  }
  const active = provenance.activeSourcePublicationProof;
  const promotion = provenance.promotionRebuild;
  return prior === null && active !== null && typeof active === "object" &&
    promotion !== null && typeof promotion === "object" &&
    active.artifactFormat ===
      "reader-summary-active-database-publication-v1" &&
    promotion.sourceAuthorityKind === "active-database-publication" &&
    active.publicationId === promotion.sourcePublicationId &&
    active.artifactId === promotion.sourceArtifactId &&
    active.reportSha256 === promotion.sourcePublicationReportSha256 &&
    active.proofSha256 === promotion.sourcePublicationProofSha256 &&
    isSha256(active.reportSha256) && isSha256(active.proofSha256);
}

function hashBoundArtifactMatches(value, artifactFormat) {
  return value !== null && typeof value === "object" &&
    value.artifactFormat === artifactFormat && isSha256(value.sha256);
}

function isSha256(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}
