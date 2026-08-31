import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import {
  readerSummaryPromotionV2HistoricalPolicyVersion,
} from "./reader-summary-promotion-v2-historical-classification";
import type {
  HistoricalPromotionEvidenceBundle,
  HistoricalPromotionRebuildReceipt,
  HistoricalPromotionReceiptStore,
} from "./reader-summary-promotion-v2-historical-runner";

type EvidenceFile = Readonly<{ path: string; sha256: string }>;

type EvidenceManifestEntry = Readonly<{
  date: string;
  expectedAuthoritativeInputDigest: string;
  sourcePublicationId: string;
  sourceArtifactId: string;
  sourcePublicationProofSha256: string;
  sourceReport: EvidenceFile;
  collectionArtifact: EvidenceFile;
  collectionQualityReport: EvidenceFile;
  datasetManifest: EvidenceFile;
  timestampPolicy: "published_at" | "observed_at";
  allowHistoricalGitHubOmission?: boolean;
  historicalGitHubOmissionReason?: string;
}>;

type EvidenceManifest = Readonly<{
  schemaVersion: 1;
  format: "reader-summary-promotion-v2-historical-evidence-manifest-v1";
  policyVersion: typeof readerSummaryPromotionV2HistoricalPolicyVersion;
  entries: readonly EvidenceManifestEntry[];
}>;

export const loadHistoricalPromotionEvidenceManifest = (input: {
  readonly path: string;
  readonly dates: readonly string[];
}): Readonly<{
  bundles: ReadonlyMap<string, HistoricalPromotionEvidenceBundle>;
  problems: ReadonlyMap<string, string>;
  inputPaths: readonly string[];
}> => {
  const manifestPath = resolve(input.path);
  const manifest = parseJson(readFileSync(manifestPath), "evidence manifest") as
    Partial<EvidenceManifest>;
  if (manifest.schemaVersion !== 1 ||
      manifest.format !==
        "reader-summary-promotion-v2-historical-evidence-manifest-v1" ||
      manifest.policyVersion !== readerSummaryPromotionV2HistoricalPolicyVersion ||
      !Array.isArray(manifest.entries)) {
    throw new Error("Historical promotion evidence manifest is invalid");
  }
  const requested = new Set(input.dates);
  const bundles = new Map<string, HistoricalPromotionEvidenceBundle>();
  const problems = new Map<string, string>();
  const inputPaths: string[] = [];
  for (const value of manifest.entries) {
    if (!isRecord(value) || typeof value.date !== "string" ||
        !requested.has(value.date)) continue;
    inputPaths.push(...manifestEntryPaths(value, manifestPath));
    if (bundles.has(value.date) || problems.has(value.date)) {
      bundles.delete(value.date);
      problems.set(value.date, "duplicate_evidence_manifest_entries");
      continue;
    }
    try {
      bundles.set(value.date, evidenceBundle(
        value as unknown as EvidenceManifestEntry,
        manifestPath,
      ));
    } catch (error) {
      problems.set(
        value.date,
        error instanceof EvidenceEntryError
          ? error.reason
          : "hash_bound_input_evidence_invalid",
      );
    }
  }
  return { bundles, problems, inputPaths };
};

export class FileHistoricalPromotionReceiptStore
  implements HistoricalPromotionReceiptStore {
  readonly outputDirectory: string;

  constructor(outputDirectory: string) {
    this.outputDirectory = resolve(outputDirectory);
  }

  async load(date: string): Promise<HistoricalPromotionRebuildReceipt | null> {
    try {
      const receipt = parseJson(
        readFileSync(this.receiptPath(date, "execute")),
        "historical promotion receipt",
      ) as HistoricalPromotionRebuildReceipt;
      if (receipt.schemaVersion !== 1 ||
          receipt.format !==
            "reader-summary-promotion-v2-historical-rebuild-receipt-v1" ||
          receipt.date !== date || receipt.mode !== "execute") {
        throw new Error("Historical promotion receipt identity is invalid");
      }
      return receipt;
    } catch (error) {
      if (hasCode(error, "ENOENT")) return null;
      throw error;
    }
  }

  async save(receipt: HistoricalPromotionRebuildReceipt): Promise<void> {
    const path = this.receiptPath(receipt.date, receipt.mode);
    writeJsonAtomically(path, receipt);
  }

  saveRunReceipt(input: {
    readonly generatedAt: string;
    readonly dryRun: boolean;
    readonly requestedDates: readonly string[];
    readonly receipts: readonly HistoricalPromotionRebuildReceipt[];
  }): string {
    const path = join(
      this.outputDirectory,
      input.dryRun
        ? "reader-summary-promotion-v2-historical-dry-run.v1.json"
        : "reader-summary-promotion-v2-historical-run.v1.json",
    );
    writeJsonAtomically(path, {
      schemaVersion: 1,
      format: "reader-summary-promotion-v2-historical-run-receipt-v1",
      generatedAt: input.generatedAt,
      mode: input.dryRun ? "dry-run" : "execute",
      policyVersion: readerSummaryPromotionV2HistoricalPolicyVersion,
      requestedDates: input.requestedDates,
      counts: Object.fromEntries(
        ["planned", "unrebuildable", "pending", "completed", "noop"].map(
          (status) => [
            status,
            input.receipts.filter((receipt) => receipt.status === status).length,
          ],
        ),
      ),
      receipts: input.receipts,
    });
    return path;
  }

  private receiptPath(
    date: string,
    mode: "dry-run" | "execute",
  ): string {
    return join(
      this.outputDirectory,
      `reader-summary-promotion-v2-${mode}-${date}.receipt.v1.json`,
    );
  }
}

export const assertHistoricalPromotionOutputIsolation = (input: {
  readonly outputDirectory: string;
  readonly manifestPath?: string;
  readonly bundles: ReadonlyMap<string, HistoricalPromotionEvidenceBundle>;
  readonly inputPaths?: readonly string[];
}): void => {
  const output = canonicalPath(input.outputDirectory);
  const inputs = [
    ...(input.manifestPath === undefined ? [] : [resolve(input.manifestPath)]),
    ...(input.inputPaths ?? []),
    ...[...input.bundles.values()].flatMap((bundle) => [
      bundle.sourceReportPath,
      bundle.collectionArtifactPath,
      bundle.collectionQualityReportPath,
      bundle.datasetManifestPath,
    ]),
  ];
  if (inputs.some((path) => isWithin(output, canonicalPath(path)))) {
    throw new Error(
      "Historical promotion artifact output must be isolated from immutable inputs",
    );
  }
};

const manifestEntryPaths = (
  entry: Record<string, unknown>,
  manifestPath: string,
): readonly string[] => [
  entry.sourceReport,
  entry.collectionArtifact,
  entry.collectionQualityReport,
  entry.datasetManifest,
].flatMap((value) => {
  if (!isRecord(value) || typeof value.path !== "string") return [];
  return [isAbsolute(value.path)
    ? resolve(value.path)
    : resolve(dirname(manifestPath), value.path)];
});

const evidenceBundle = (
  entry: EvidenceManifestEntry,
  manifestPath: string,
): HistoricalPromotionEvidenceBundle => {
  if (!isUuid(entry.sourcePublicationId) || !isUuid(entry.sourceArtifactId) ||
      !isSha256(entry.sourcePublicationProofSha256) ||
      !isSha256(entry.expectedAuthoritativeInputDigest) ||
      (entry.timestampPolicy !== "published_at" &&
        entry.timestampPolicy !== "observed_at")) {
    throw new EvidenceEntryError("evidence_identity_or_policy_invalid");
  }
  const reason = entry.historicalGitHubOmissionReason?.trim();
  if (entry.allowHistoricalGitHubOmission === true &&
      (reason === undefined || reason.length < 20 || reason.length > 500 ||
        /[\r\n]/u.test(reason))) {
    throw new EvidenceEntryError("historical_github_omission_invalid");
  }
  const sourceReport = verifiedEvidenceFile(
    entry.sourceReport,
    manifestPath,
    "source_report",
  );
  const collectionArtifact = verifiedEvidenceFile(
    entry.collectionArtifact,
    manifestPath,
    "collection_artifact",
  );
  const collectionQualityReport = verifiedEvidenceFile(
    entry.collectionQualityReport,
    manifestPath,
    "collection_quality_report",
  );
  const datasetManifest = verifiedEvidenceFile(
    entry.datasetManifest,
    manifestPath,
    "dataset_manifest",
  );
  return {
    date: entry.date,
    expectedAuthoritativeInputDigest: entry.expectedAuthoritativeInputDigest,
    sourcePublicationId: entry.sourcePublicationId,
    sourceArtifactId: entry.sourceArtifactId,
    sourcePublicationProofSha256: entry.sourcePublicationProofSha256,
    sourceReportPath: sourceReport.path,
    sourceReportSha256: sourceReport.sha256,
    collectionArtifactPath: collectionArtifact.path,
    collectionArtifactSha256: collectionArtifact.sha256,
    collectionQualityReportPath: collectionQualityReport.path,
    collectionQualityReportSha256: collectionQualityReport.sha256,
    datasetManifestPath: datasetManifest.path,
    datasetManifestSha256: datasetManifest.sha256,
    timestampPolicy: entry.timestampPolicy,
    allowHistoricalGitHubOmission: entry.allowHistoricalGitHubOmission === true,
    ...(reason === undefined ? {} : { historicalGitHubOmissionReason: reason }),
  };
};

const verifiedEvidenceFile = (
  value: unknown,
  manifestPath: string,
  label: string,
): EvidenceFile => {
  if (!isRecord(value) || typeof value.path !== "string" ||
      !isSha256(value.sha256)) {
    throw new EvidenceEntryError(`${label}_binding_invalid`);
  }
  const path = isAbsolute(value.path)
    ? resolve(value.path)
    : resolve(dirname(manifestPath), value.path);
  try {
    if (!statSync(path).isFile()) {
      throw new EvidenceEntryError(`${label}_not_a_file`);
    }
  } catch (error) {
    if (error instanceof EvidenceEntryError) throw error;
    throw new EvidenceEntryError(`${label}_unavailable`);
  }
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch {
    throw new EvidenceEntryError(`${label}_unavailable`);
  }
  const digest = sha256(bytes);
  if (digest !== value.sha256) {
    throw new EvidenceEntryError(`${label}_hash_mismatch`);
  }
  return { path, sha256: digest };
};

class EvidenceEntryError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

const writeJsonAtomically = (path: string, value: unknown): void => {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const next = `${path}.next-${process.pid}-${randomUUID()}`;
  writeFileSync(next, `${JSON.stringify(value, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  renameSync(next, path);
};

const isWithin = (parent: string, child: string): boolean => {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
};

const canonicalPath = (path: string): string => {
  const absolute = resolve(path);
  try {
    return realpathSync.native(absolute);
  } catch {
    return absolute;
  }
};

const parseJson = (bytes: Buffer, label: string): unknown => {
  try {
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    throw new Error(`Historical promotion ${label} is not valid JSON`);
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
    .test(value);

const isSha256 = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);

const sha256 = (bytes: Buffer): string =>
  createHash("sha256").update(bytes).digest("hex");

const hasCode = (error: unknown, code: string): boolean =>
  typeof error === "object" && error !== null && "code" in error &&
  error.code === code;
