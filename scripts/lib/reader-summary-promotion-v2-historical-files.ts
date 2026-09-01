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
import { parseReaderSummaryDayDatasetManifest } from
  "./reader-summary-day-dataset-manifest";
import { buildHistoricalPromotionCanonicalInput } from
  "./reader-summary-promotion-v2-historical-input";
import type { HistoricalPromotionGenerationAuthority } from
  "./reader-summary-promotion-v2-historical-input";
import { readerSummaryProductionDayScope } from
  "./reader-summary-production-day-scope";
import type {
  HistoricalPromotionEvidenceBundle,
  HistoricalPromotionRebuildReceipt,
  HistoricalPromotionReceiptStore,
} from "./reader-summary-promotion-v2-historical-runner";
import {
  openSecureDirectory,
  type SecureDirectoryHandle,
} from
  "./reader-summary-promotion-v2-secure-directory";

type EvidenceFileEntry = Readonly<{ path: string; sha256: string }>;
type VerifiedEvidenceFile = Readonly<{
  path: string;
  sha256: string;
  bytes: Buffer;
}>;

type EvidenceManifestEntry = Readonly<{
  date: string;
  authoritativeInputDigest: string;
  sourceAuthority:
    | Readonly<{
        kind: "active-database-publication";
        publicationId: string;
        artifactId: string;
        reportSha256: string;
        proofSha256: string;
      }>
    | Readonly<{
        kind: "preserved-production-day-report";
        publicationId: string;
        artifactId: string;
        reportSha256: string;
        proofSha256: string;
        sourceReport: EvidenceFileEntry;
        collectionArtifact: EvidenceFileEntry;
        collectionQualityReport: EvidenceFileEntry;
      }>;
  datasetManifest: EvidenceFileEntry;
  timestampPolicy: "published_at" | "observed_at";
  generationAuthority: HistoricalPromotionGenerationAuthority;
  allowHistoricalGitHubOmission?: boolean;
  historicalGitHubOmissionReason?: string;
}>;

type EvidenceManifest = Readonly<{
  schemaVersion: 2;
  format: "reader-summary-promotion-v2-historical-evidence-manifest-v2";
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
  if (manifest.schemaVersion !== 2 ||
      manifest.format !==
        "reader-summary-promotion-v2-historical-evidence-manifest-v2" ||
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
  private readonly outputHandle: SecureDirectoryHandle;

  constructor(outputDirectory: string) {
    this.outputDirectory = resolve(outputDirectory);
    this.outputHandle = openSecureDirectory(this.outputDirectory, true);
  }

  close(): void {
    this.outputHandle.close();
  }

  get outputIdentity(): string {
    return this.outputHandle.identity;
  }

  async load(date: string): Promise<HistoricalPromotionRebuildReceipt | null> {
    try {
      const receipt = parseJson(
        readFileSync(this.receiptPath(
          date,
          "execute",
          this.outputHandle.fdPath,
        )),
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
    writeJsonAtomically(
      this.receiptPath(
        receipt.date,
        receipt.mode,
        this.outputHandle.fdPath,
      ),
      receipt,
    );
  }

  saveRunReceipt(input: {
    readonly generatedAt: string;
    readonly dryRun: boolean;
    readonly requestedDates: readonly string[];
    readonly receipts: readonly HistoricalPromotionRebuildReceipt[];
  }): string {
    const path = join(
      this.outputHandle.fdPath,
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
              input.receipts.filter((receipt) =>
                receipt.status === status).length,
            ],
          ),
        ),
        receipts: input.receipts,
    });
    return join(this.outputDirectory, path.split("/").at(-1)!);
  }

  private receiptPath(
    date: string,
    mode: "dry-run" | "execute",
    directory = this.outputDirectory,
  ): string {
    return join(
      directory,
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
      ...(bundle.sourceEvidence.kind === "active-database-publication"
        ? []
        : [
            bundle.sourceEvidence.sourceReportPath,
            bundle.sourceEvidence.collectionArtifactPath,
            bundle.sourceEvidence.collectionQualityReportPath,
          ]),
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
  ...(isRecord(entry.sourceAuthority)
    ? [
        entry.sourceAuthority.sourceReport,
        entry.sourceAuthority.collectionArtifact,
        entry.sourceAuthority.collectionQualityReport,
      ]
    : []),
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
  if (!isRecord(entry.sourceAuthority) ||
      (entry.sourceAuthority.kind !== "active-database-publication" &&
        entry.sourceAuthority.kind !== "preserved-production-day-report") ||
      !isUuid(entry.sourceAuthority.publicationId) ||
      !isUuid(entry.sourceAuthority.artifactId) ||
      !isSha256(entry.sourceAuthority.reportSha256) ||
      !isSha256(entry.sourceAuthority.proofSha256) ||
      !isSha256(entry.authoritativeInputDigest) ||
      (entry.timestampPolicy !== "published_at" &&
        entry.timestampPolicy !== "observed_at") ||
      !isRecord(entry.generationAuthority)) {
    throw new EvidenceEntryError("evidence_identity_or_policy_invalid");
  }
  const reason = entry.historicalGitHubOmissionReason?.trim();
  if (entry.allowHistoricalGitHubOmission === true &&
      (reason === undefined || reason.length < 20 || reason.length > 500 ||
        /[\r\n]/u.test(reason))) {
    throw new EvidenceEntryError("historical_github_omission_invalid");
  }
  const sourceEvidence = entry.sourceAuthority.kind ===
    "active-database-publication"
    ? { kind: entry.sourceAuthority.kind } as const
    : preservedSourceEvidence(entry.sourceAuthority, manifestPath);
  const datasetManifest = verifiedEvidenceFile(
    entry.datasetManifest,
    manifestPath,
    "dataset_manifest",
  );
  const parsedDatasetManifest = parseReaderSummaryDayDatasetManifest(
    datasetManifest.bytes,
  );
  if (parsedDatasetManifest.scope.tenantId !==
        readerSummaryProductionDayScope.tenantId ||
      parsedDatasetManifest.scope.workspaceId !==
        readerSummaryProductionDayScope.workspaceId) {
    throw new EvidenceEntryError("dataset_scope_mismatch");
  }
  if (parsedDatasetManifest.policy.timestampPolicy !== entry.timestampPolicy) {
    throw new EvidenceEntryError("dataset_timestamp_policy_mismatch");
  }
  const canonical = buildHistoricalPromotionCanonicalInput({
    date: entry.date,
    sourcePublication: {
      kind: "active-database-publication",
      publicationId: entry.sourceAuthority.publicationId,
      artifactId: entry.sourceAuthority.artifactId,
      reportSha256: entry.sourceAuthority.reportSha256,
      proofSha256: entry.sourceAuthority.proofSha256,
    },
    datasetManifest: parsedDatasetManifest,
    datasetManifestSha256: datasetManifest.sha256,
    supportingEvidence: sourceEvidence.kind === "active-database-publication"
      ? { kind: sourceEvidence.kind }
      : {
          kind: sourceEvidence.kind,
          sourceReportSha256: sourceEvidence.sourceReportSha256,
          collectionArtifactSha256: sourceEvidence.collectionArtifactSha256,
          collectionQualityReportSha256:
            sourceEvidence.collectionQualityReportSha256,
        },
    generationAuthority: entry.generationAuthority,
    allowHistoricalGitHubOmission:
      entry.allowHistoricalGitHubOmission === true,
    ...(reason === undefined ? {} : { historicalGitHubOmissionReason: reason }),
  });
  if (canonical.authoritativeInputDigest !== entry.authoritativeInputDigest) {
    throw new EvidenceEntryError("canonical_input_digest_mismatch");
  }
  return {
    date: entry.date,
    authoritativeInputDigest: canonical.authoritativeInputDigest,
    canonicalInput: canonical.envelope,
    sourcePublicationId: entry.sourceAuthority.publicationId,
    sourceArtifactId: entry.sourceAuthority.artifactId,
    sourcePublicationReportSha256: entry.sourceAuthority.reportSha256,
    sourcePublicationProofSha256: entry.sourceAuthority.proofSha256,
    sourceEvidence,
    datasetManifestPath: datasetManifest.path,
    datasetManifestSha256: datasetManifest.sha256,
    timestampPolicy: entry.timestampPolicy,
    allowHistoricalGitHubOmission: entry.allowHistoricalGitHubOmission === true,
    ...(reason === undefined ? {} : { historicalGitHubOmissionReason: reason }),
  };
};

const preservedSourceEvidence = (
  source: Extract<
    EvidenceManifestEntry["sourceAuthority"],
    { readonly kind: "preserved-production-day-report" }
  >,
  manifestPath: string,
): Extract<
  HistoricalPromotionEvidenceBundle["sourceEvidence"],
  { readonly kind: "preserved-production-day-report" }
> => {
  const sourceReport = verifiedEvidenceFile(
    source.sourceReport,
    manifestPath,
    "source_report",
  );
  const collectionArtifact = verifiedEvidenceFile(
    source.collectionArtifact,
    manifestPath,
    "collection_artifact",
  );
  const collectionQualityReport = verifiedEvidenceFile(
    source.collectionQualityReport,
    manifestPath,
    "collection_quality_report",
  );
  return {
    kind: source.kind,
    sourceReportPath: sourceReport.path,
    sourceReportSha256: sourceReport.sha256,
    collectionArtifactPath: collectionArtifact.path,
    collectionArtifactSha256: collectionArtifact.sha256,
    collectionQualityReportPath: collectionQualityReport.path,
    collectionQualityReportSha256: collectionQualityReport.sha256,
  };
};

const verifiedEvidenceFile = (
  value: unknown,
  manifestPath: string,
  label: string,
): VerifiedEvidenceFile => {
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
  return { path, sha256: digest, bytes };
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
