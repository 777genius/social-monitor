import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildReaderSummaryDayDatasetManifest } from
  "./reader-summary-day-dataset-manifest";
import { readerSummaryProductionDayScope } from
  "./reader-summary-production-day-scope";
import {
  FileHistoricalPromotionReceiptStore,
  assertHistoricalPromotionOutputIsolation,
  loadHistoricalPromotionEvidenceManifest,
} from "./reader-summary-promotion-v2-historical-files";
import { buildHistoricalPromotionCanonicalInput } from
  "./reader-summary-promotion-v2-historical-input";
import { historicalPromotionGenerationAuthority } from
  "./reader-summary-promotion-v2-historical-generation-authority";
import type { HistoricalPromotionRebuildReceipt } from
  "./reader-summary-promotion-v2-historical-runner";

describe("historical promotion evidence and receipt files", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "reader-promotion-v2-files-"));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("hash-binds every required legacy input and canonical dataset aggregate", () => {
    const fixture = evidenceFixture(directory, "preserved-production-day-report");
    const loaded = loadHistoricalPromotionEvidenceManifest({
      path: fixture.manifestPath,
      dates: [fixture.date],
    });

    expect(loaded.problems.size).toBe(0);
    expect(loaded.bundles.get(fixture.date)).toMatchObject({
      authoritativeInputDigest: fixture.authoritativeInputDigest,
      sourcePublicationReportSha256: "3".repeat(64),
      sourceEvidence: {
        kind: "preserved-production-day-report",
        sourceReportSha256: fixture.files.source!.sha256,
        collectionArtifactSha256: fixture.files.collection!.sha256,
        collectionQualityReportSha256: fixture.files.quality!.sha256,
      },
      datasetManifestSha256: fixture.files.dataset!.sha256,
    });
  });

  it("loads active DB publication evidence without inventing an old report", () => {
    const fixture = evidenceFixture(directory, "active-database-publication");
    const loaded = loadHistoricalPromotionEvidenceManifest({
      path: fixture.manifestPath,
      dates: [fixture.date],
    });

    expect(loaded.problems.size).toBe(0);
    expect(loaded.bundles.get(fixture.date)).toMatchObject({
      sourceEvidence: { kind: "active-database-publication" },
      authoritativeInputDigest: fixture.authoritativeInputDigest,
    });
    expect(JSON.stringify(JSON.parse(readFileSync(
      fixture.manifestPath,
      "utf8",
    )))).not.toMatch(/sourceReport|collectionQualityReport/u);
  });

  it("isolates input drift to the affected date before execution", () => {
    const fixture = evidenceFixture(directory, "preserved-production-day-report", {
      sourceHash: "0".repeat(64),
    });
    const loaded = loadHistoricalPromotionEvidenceManifest({
      path: fixture.manifestPath,
      dates: [fixture.date],
    });

    expect(loaded.bundles.has(fixture.date)).toBe(false);
    expect(loaded.problems.get(fixture.date)).toBe(
      "source_report_hash_mismatch",
    );
  });

  it("rejects a hand-edited full canonical digest", () => {
    const fixture = evidenceFixture(directory, "active-database-publication", {
      authoritativeInputDigest: "f".repeat(64),
    });
    const loaded = loadHistoricalPromotionEvidenceManifest({
      path: fixture.manifestPath,
      dates: [fixture.date],
    });

    expect(loaded.problems.get(fixture.date)).toBe(
      "canonical_input_digest_mismatch",
    );
  });

  it("persists execution and dry-run receipts separately", async () => {
    const store = new FileHistoricalPromotionReceiptStore(directory);
    const execute = receipt("execute", "completed");
    const dryRun = receipt("dry-run", "planned");

    await store.save(execute);
    await store.save(dryRun);

    expect(await store.load(execute.date)).toEqual(execute);
    expect(JSON.parse(readFileSync(join(
      directory,
      `reader-summary-promotion-v2-dry-run-${execute.date}.receipt.v1.json`,
    ), "utf8"))).toEqual(dryRun);
  });

  it("rejects artifact output that could overwrite immutable evidence", () => {
    const fixture = evidenceFixture(directory, "active-database-publication");
    const loaded = loadHistoricalPromotionEvidenceManifest({
      path: fixture.manifestPath,
      dates: [fixture.date],
    });
    expect(() => assertHistoricalPromotionOutputIsolation({
      outputDirectory: directory,
      bundles: loaded.bundles,
    })).toThrow("must be isolated from immutable inputs");
  });
});

const evidenceFixture = (
  directory: string,
  sourceKind:
    | "active-database-publication"
    | "preserved-production-day-report",
  overrides: {
    readonly sourceHash?: string;
    readonly authoritativeInputDigest?: string;
  } = {},
) => {
  const date = "2026-08-01";
  const files = Object.fromEntries(
    ["source", "collection", "quality"].map((name) => {
      const path = join(directory, `${name}.json`);
      const bytes = Buffer.from(`{"fixture":"${name}"}\n`, "utf8");
      writeFileSync(path, bytes);
      return [name, { path, sha256: sha256(bytes) }];
    }),
  ) as Record<string, { path: string; sha256: string }>;
  const dataset = buildReaderSummaryDayDatasetManifest({
    tenantId: readerSummaryProductionDayScope.tenantId,
    workspaceId: readerSummaryProductionDayScope.workspaceId,
    startedAt: new Date(`${date}T00:00:00.000Z`),
    endedAt: new Date("2026-08-02T00:00:00.000Z"),
    generatedAt: new Date("2026-08-31T11:55:00.000Z"),
    feedRows: [{ providerKey: "reddit", rowJson: '{"title":"safe"}' }],
    eligibilityRows: [],
  });
  const datasetPath = join(directory, "dataset.json");
  const datasetBytes = Buffer.from(`${JSON.stringify(dataset, null, 2)}\n`);
  writeFileSync(datasetPath, datasetBytes);
  files.dataset = { path: datasetPath, sha256: sha256(datasetBytes) };
  const sourcePublication = {
    kind: "active-database-publication" as const,
    publicationId: "00000000-0000-4000-8000-000000000101",
    artifactId: "00000000-0000-4000-8000-000000000102",
    reportSha256: "3".repeat(64),
    proofSha256: "2".repeat(64),
  };
  const supportingEvidence = sourceKind === "active-database-publication"
    ? { kind: sourceKind } as const
    : {
        kind: sourceKind,
        sourceReportSha256: files.source!.sha256,
        collectionArtifactSha256: files.collection!.sha256,
        collectionQualityReportSha256: files.quality!.sha256,
      } as const;
  const canonical = buildHistoricalPromotionCanonicalInput({
    date,
    sourcePublication,
    datasetManifest: dataset,
    datasetManifestSha256: files.dataset.sha256,
    supportingEvidence,
    generationAuthority: historicalPromotionGenerationAuthority({
      tenantId: dataset.scope.tenantId,
      workspaceId: dataset.scope.workspaceId,
      env: {},
    }),
    allowHistoricalGitHubOmission: true,
    historicalGitHubOmissionReason:
      "No preserved GitHub rows exist in this deterministic closed-date fixture.",
  });
  const sourceAuthority = sourceKind === "active-database-publication"
    ? { ...sourcePublication, kind: sourceKind }
    : {
        ...sourcePublication,
        kind: sourceKind,
        sourceReport: {
          ...files.source!,
          sha256: overrides.sourceHash ?? files.source!.sha256,
        },
        collectionArtifact: files.collection,
        collectionQualityReport: files.quality,
      };
  const authoritativeInputDigest = overrides.authoritativeInputDigest ??
    canonical.authoritativeInputDigest;
  const manifestPath = join(directory, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 2,
    format: "reader-summary-promotion-v2-historical-evidence-manifest-v2",
    policyVersion: "reader_post_promotion.v2",
    entries: [{
      date,
      authoritativeInputDigest,
      sourceAuthority,
      datasetManifest: files.dataset,
      timestampPolicy: "published_at",
      generationAuthority: canonical.envelope.generationAuthority,
      allowHistoricalGitHubOmission: true,
      historicalGitHubOmissionReason:
        "No preserved GitHub rows exist in this deterministic closed-date fixture.",
    }],
  }));
  return { date, files, manifestPath, authoritativeInputDigest };
};

const receipt = (
  mode: "dry-run" | "execute",
  status: "planned" | "completed",
): HistoricalPromotionRebuildReceipt => ({
  schemaVersion: 1,
  format: "reader-summary-promotion-v2-historical-rebuild-receipt-v1",
  generatedAt: "2026-08-31T12:00:00.000Z",
  mode,
  date: "2026-08-01",
  status,
  reason: "fixture",
  identity: null,
  classification: null,
  timestampPolicy: null,
  fenceToken: null,
  retrySafety: "not-applicable",
  outputIdentity: null,
  selectedCounts: null,
  qualityGates: null,
  rollbackAuthority: null,
  pointerSwitch: {
    authority: "PrismaReaderSummaryPublication.publish_reader_summary",
    attempted: false,
    switched: false,
    previousPublicationId: null,
    activePublicationId: null,
  },
});

const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");
