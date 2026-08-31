import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  FileHistoricalPromotionReceiptStore,
  assertHistoricalPromotionOutputIsolation,
  loadHistoricalPromotionEvidenceManifest,
} from "./reader-summary-promotion-v2-historical-files";
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

  it("hash-binds every required immutable input file", () => {
    const files = Object.fromEntries(
      ["source", "collection", "quality", "dataset"].map((name) => {
        const path = join(directory, `${name}.json`);
        const bytes = Buffer.from(`{"fixture":"${name}"}\n`, "utf8");
        writeFileSync(path, bytes);
        return [name, { path, sha256: sha256(bytes) }];
      }),
    ) as Record<string, { path: string; sha256: string }>;
    const manifestPath = join(directory, "manifest.json");
    writeFileSync(manifestPath, JSON.stringify({
      schemaVersion: 1,
      format: "reader-summary-promotion-v2-historical-evidence-manifest-v1",
      policyVersion: "reader_post_promotion.v2",
      entries: [{
        date: "2026-08-01",
        expectedAuthoritativeInputDigest: "1".repeat(64),
        sourcePublicationId: "00000000-0000-4000-8000-000000000101",
        sourceArtifactId: "00000000-0000-4000-8000-000000000101",
        sourcePublicationProofSha256: "2".repeat(64),
        sourceReport: files.source,
        collectionArtifact: files.collection,
        collectionQualityReport: files.quality,
        datasetManifest: files.dataset,
        timestampPolicy: "published_at",
      }],
    }));

    const loaded = loadHistoricalPromotionEvidenceManifest({
      path: manifestPath,
      dates: ["2026-08-01"],
    });

    expect(loaded.problems.size).toBe(0);
    expect(loaded.bundles.get("2026-08-01")).toMatchObject({
      sourceReportSha256: files.source!.sha256,
      collectionArtifactSha256: files.collection!.sha256,
      collectionQualityReportSha256: files.quality!.sha256,
      datasetManifestSha256: files.dataset!.sha256,
    });
  });

  it("isolates input drift to the affected date before execution", () => {
    const inputPath = join(directory, "input.json");
    writeFileSync(inputPath, "{}\n");
    const manifestPath = join(directory, "manifest.json");
    writeFileSync(manifestPath, JSON.stringify({
      schemaVersion: 1,
      format: "reader-summary-promotion-v2-historical-evidence-manifest-v1",
      policyVersion: "reader_post_promotion.v2",
      entries: [{
        date: "2026-08-01",
        expectedAuthoritativeInputDigest: "1".repeat(64),
        sourcePublicationId: "00000000-0000-4000-8000-000000000101",
        sourceArtifactId: "00000000-0000-4000-8000-000000000101",
        sourcePublicationProofSha256: "2".repeat(64),
        sourceReport: { path: inputPath, sha256: "3".repeat(64) },
        collectionArtifact: { path: inputPath, sha256: "3".repeat(64) },
        collectionQualityReport: { path: inputPath, sha256: "3".repeat(64) },
        datasetManifest: { path: inputPath, sha256: "3".repeat(64) },
        timestampPolicy: "published_at",
      }],
    }));

    const loaded = loadHistoricalPromotionEvidenceManifest({
      path: manifestPath,
      dates: ["2026-08-01"],
    });

    expect(loaded.bundles.has("2026-08-01")).toBe(false);
    expect(loaded.problems.get("2026-08-01")).toBe(
      "source_report_hash_mismatch",
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
    const inputPath = join(directory, "input", "source.json");
    expect(() => assertHistoricalPromotionOutputIsolation({
      outputDirectory: directory,
      bundles: new Map([["2026-08-01", {
        date: "2026-08-01",
        expectedAuthoritativeInputDigest: "1".repeat(64),
        sourcePublicationId: "00000000-0000-4000-8000-000000000101",
        sourceArtifactId: "00000000-0000-4000-8000-000000000101",
        sourcePublicationProofSha256: "2".repeat(64),
        sourceReportPath: inputPath,
        sourceReportSha256: "3".repeat(64),
        collectionArtifactPath: "/evidence/collection.json",
        collectionArtifactSha256: "4".repeat(64),
        collectionQualityReportPath: "/evidence/quality.json",
        collectionQualityReportSha256: "5".repeat(64),
        datasetManifestPath: "/evidence/dataset.json",
        datasetManifestSha256: "6".repeat(64),
        timestampPolicy: "published_at",
        allowHistoricalGitHubOmission: false,
      }]]),
    })).toThrow("must be isolated from immutable inputs");
  });
});

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
  fenceToken: null,
  retrySafety: "not-applicable",
  outputIdentity: null,
  selectedCounts: null,
  qualityGates: null,
  pointerSwitch: {
    authority: "PrismaReaderSummaryPublication.publish_reader_summary",
    attempted: false,
    switched: false,
    previousPublicationId: null,
    activePublicationId: null,
  },
});

const sha256 = (bytes: Buffer): string =>
  createHash("sha256").update(bytes).digest("hex");
