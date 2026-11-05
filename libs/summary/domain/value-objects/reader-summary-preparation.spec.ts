import {
  assertReaderSummaryPreparationManifest,
  READER_SUMMARY_PREPARATION_CONFIG_VERSION,
  type ReaderSummaryPreparationCandidate,
  type ReaderSummaryWorkspacePreparationManifest,
} from "./reader-summary-preparation";

const sha = "0".repeat(64);

const candidate = (index: number, blobBytes: number):
ReaderSummaryPreparationCandidate & { readonly interestId: string } => ({
  candidateId: `00000000-0000-7000-8000-${String(index).padStart(12, "0")}`,
  interestId: "00000000-0000-7000-8000-000000006105",
  sourceBindingId: `binding-${index}`,
  sourceItemId: `source-${index}`,
  sourceRevisionKey: `revision-${index}`,
  providerKey: "x",
  publishedAt: "2026-10-05T00:00:00.000Z",
  observedAt: "2026-10-05T00:00:01.000Z",
  sourceKind: "x_post",
  canonicalIdentity: `https://example.invalid/${index}`,
  sourceSnapshotSha256: sha,
  inputSha256: sha,
  assessmentId: `assessment-${index}`,
  providerMetadata: { blob: "x".repeat(blobBytes) },
});

const workspaceManifest = (candidates: number, blobBytes: number):
ReaderSummaryWorkspacePreparationManifest => ({
  schemaVersion: "reader_summary_preparation_manifest.v2",
  cutoffAt: "2026-10-12T00:00:00.000Z",
  periodKey: "weekly:2026-10-05T00:00:00.000Z:2026-10-12T00:00:00.000Z:UTC",
  interests: [{
    schemaVersion: READER_SUMMARY_PREPARATION_CONFIG_VERSION,
    interestId: "00000000-0000-7000-8000-000000006105",
    interestSha256: sha,
    rubricVersion: "rubric.v1",
    rubricSha256: sha,
    inputBuilderVersion: "input.v1",
    modelConfigVersion: "model.v1",
  }],
  candidates: Array.from({ length: candidates }, (_, index) =>
    candidate(index, blobBytes)),
});

describe("ReaderSummaryPreparation manifest budget", () => {
  // Regression: a weekly window freezes observed engagement inside
  // providerMetadata, so the manifest alone exceeded the old 16 MiB
  // ceiling and every weekly job failed with assessment_inventory_over_budget.
  it("accepts a weekly workspace manifest with fat provider metadata", () => {
    const manifest = workspaceManifest(4, 5 * 1024 * 1024);
    expect(Buffer.byteLength(JSON.stringify(manifest), "utf8"))
      .toBeGreaterThan(16 * 1024 * 1024);
    expect(() => assertReaderSummaryPreparationManifest(manifest)).not.toThrow();
  });

  it("rejects a workspace manifest beyond the 64 MiB ceiling", () => {
    const manifest = workspaceManifest(14, 5 * 1024 * 1024);
    expect(Buffer.byteLength(JSON.stringify(manifest), "utf8"))
      .toBeGreaterThan(64 * 1024 * 1024);
    expect(() => assertReaderSummaryPreparationManifest(manifest))
      .toThrow("Workspace reader summary preparation manifest is invalid");
  });
});
