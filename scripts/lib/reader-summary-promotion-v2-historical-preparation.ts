import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import type { ReaderSummaryDayDatasetManifest } from
  "./reader-summary-day-dataset-manifest";
import {
  assertClosedUtcDate,
  classifyHistoricalPromotionAuthority,
  readerSummaryPromotionV2HistoricalPolicyVersion,
} from "./reader-summary-promotion-v2-historical-classification";
import { buildHistoricalPromotionCanonicalInput } from
  "./reader-summary-promotion-v2-historical-input";
import type {
  HistoricalPromotionAuthorityReader,
} from "./reader-summary-promotion-v2-historical-runner";

export type HistoricalPromotionActiveSourcePublication = Readonly<{
  publicationId: string;
  artifactId: string;
  reportSha256: string;
  proofSha256: string;
}>;

export interface HistoricalPromotionPreparationReader {
  readActiveSource(
    date: string,
  ): Promise<HistoricalPromotionActiveSourcePublication | null>;
  captureDataset(input: {
    date: string;
    generatedAt: Date;
    timestampPolicy: "published_at" | "observed_at";
  }): Promise<ReaderSummaryDayDatasetManifest>;
}

export type HistoricalPromotionPreparationResult = Readonly<{
  date: string;
  status: "prepared" | "pending" | "unrebuildable";
  reason: string;
  classificationKind: string;
  sourcePublication: HistoricalPromotionActiveSourcePublication | null;
  datasetManifest: ReaderSummaryDayDatasetManifest | null;
  datasetManifestBytes: Buffer | null;
  authoritativeInputDigest: string | null;
}>;

export class ReaderSummaryPromotionV2HistoricalPreparation {
  constructor(private readonly dependencies: {
    authority: HistoricalPromotionAuthorityReader;
    preparation: HistoricalPromotionPreparationReader;
    clock: () => Date;
  }) {}

  async prepare(input: {
    readonly dates: readonly string[];
    readonly batchSize: number;
    readonly timestampPolicy: "published_at" | "observed_at";
  }): Promise<readonly HistoricalPromotionPreparationResult[]> {
    const now = this.dependencies.clock();
    if (!Number.isInteger(input.batchSize) || input.batchSize < 1 ||
        input.batchSize > 2) {
      throw new Error("Historical promotion preparation batch size must be 1 or 2");
    }
    const dates = [...new Set(input.dates)].sort();
    if (dates.length === 0 || dates.length !== input.dates.length) {
      throw new Error("Historical promotion preparation dates are invalid");
    }
    dates.forEach((date) => assertClosedUtcDate(date, now));
    return runBounded(dates, input.batchSize, async (date) =>
      this.prepareDate(date, input.timestampPolicy, now));
  }

  private async prepareDate(
    date: string,
    timestampPolicy: "published_at" | "observed_at",
    generatedAt: Date,
  ): Promise<HistoricalPromotionPreparationResult> {
    let classification;
    try {
      classification = classifyHistoricalPromotionAuthority({
        date,
        inspection: await this.dependencies.authority.inspect(date),
      });
    } catch {
      return result(date, "pending", "authoritative_input_unavailable");
    }
    if (classification.kind === "unrebuildable") {
      return result(
        date,
        "unrebuildable",
        classification.reason,
        classification.kind,
      );
    }
    let sourcePublication: HistoricalPromotionActiveSourcePublication | null;
    let datasetManifest: ReaderSummaryDayDatasetManifest;
    try {
      [sourcePublication, datasetManifest] = await Promise.all([
        this.dependencies.preparation.readActiveSource(date),
        this.dependencies.preparation.captureDataset({
          date,
          generatedAt,
          timestampPolicy,
        }),
      ]);
    } catch {
      return result(
        date,
        "pending",
        "active_publication_or_dataset_evidence_unavailable",
        classification.kind,
      );
    }
    if (sourcePublication === null) {
      return result(
        date,
        "pending",
        "active_daily_publication_or_proof_missing",
        classification.kind,
      );
    }
    if (datasetManifest.dataset.feedRowCount !==
          classification.visibleFeedRowCount ||
        JSON.stringify(datasetManifest.dataset.providerCounts) !==
          JSON.stringify(classification.providerCounts)) {
      return result(
        date,
        "pending",
        "dataset_inventory_drift_during_preparation",
        classification.kind,
      );
    }
    const datasetManifestBytes = Buffer.from(
      `${JSON.stringify(datasetManifest, null, 2)}\n`,
      "utf8",
    );
    const githubRows =
      datasetManifest.dataset.providerCounts["github-trending-page"] ?? 0;
    const canonical = buildHistoricalPromotionCanonicalInput({
      date,
      sourcePublication: {
        kind: "active-database-publication",
        ...sourcePublication,
      },
      datasetManifest,
      datasetManifestSha256: sha256(datasetManifestBytes),
      supportingEvidence: { kind: "active-database-publication" },
      allowHistoricalGitHubOmission: githubRows === 0,
      ...(githubRows === 0
        ? {
            historicalGitHubOmissionReason:
              "No preserved GitHub rows exist in the freshly captured canonical dataset for this closed UTC date.",
          }
        : {}),
    });
    return {
      date,
      status: "prepared",
      reason: "active_publication_and_canonical_dataset_captured",
      classificationKind: classification.kind,
      sourcePublication,
      datasetManifest,
      datasetManifestBytes,
      authoritativeInputDigest: canonical.authoritativeInputDigest,
    };
  }
}

export const writeHistoricalPromotionPreparation = (input: {
  readonly outputDirectory: string;
  readonly generatedAt: string;
  readonly results: readonly HistoricalPromotionPreparationResult[];
}): Readonly<{ manifestPath: string; receiptPath: string }> => {
  const outputDirectory = resolve(input.outputDirectory);
  const entries = input.results.flatMap((prepared) => {
    if (prepared.status !== "prepared" ||
        prepared.datasetManifest === null ||
        prepared.datasetManifestBytes === null ||
        prepared.sourcePublication === null ||
        prepared.authoritativeInputDigest === null) {
      return [];
    }
    const datasetPath = join(
      outputDirectory,
      prepared.date,
      "reader-summary-day-dataset-manifest.v1.json",
    );
    writeImmutableOrVerify(datasetPath, prepared.datasetManifestBytes);
    const githubRows = prepared.datasetManifest.dataset
      .providerCounts["github-trending-page"] ?? 0;
    return [{
      date: prepared.date,
      authoritativeInputDigest: prepared.authoritativeInputDigest,
      sourceAuthority: {
        kind: "active-database-publication",
        publicationId: prepared.sourcePublication.publicationId,
        artifactId: prepared.sourcePublication.artifactId,
        reportSha256: prepared.sourcePublication.reportSha256,
        proofSha256: prepared.sourcePublication.proofSha256,
      },
      datasetManifest: {
        path: relative(outputDirectory, datasetPath),
        sha256: sha256(prepared.datasetManifestBytes),
      },
      timestampPolicy: prepared.datasetManifest.policy.timestampPolicy,
      allowHistoricalGitHubOmission: githubRows === 0,
      ...(githubRows === 0
        ? {
            historicalGitHubOmissionReason:
              "No preserved GitHub rows exist in the freshly captured canonical dataset for this closed UTC date.",
          }
        : {}),
    }];
  });
  const manifestPath = join(
    outputDirectory,
    "reader-summary-promotion-v2-historical-evidence-manifest.v2.json",
  );
  writeJsonAtomically(manifestPath, {
    schemaVersion: 2,
    format: "reader-summary-promotion-v2-historical-evidence-manifest-v2",
    policyVersion: readerSummaryPromotionV2HistoricalPolicyVersion,
    entries,
  });
  const receiptPath = join(
    outputDirectory,
    "reader-summary-promotion-v2-historical-preparation.v1.json",
  );
  writeJsonAtomically(receiptPath, {
    schemaVersion: 1,
    format: "reader-summary-promotion-v2-historical-preparation-v1",
    generatedAt: input.generatedAt,
    readOnlyDatabasePreparation: true,
    results: input.results.map((item) => ({
      date: item.date,
      status: item.status,
      reason: item.reason,
      classificationKind: item.classificationKind,
      sourcePublicationId: item.sourcePublication?.publicationId ?? null,
      sourceArtifactId: item.sourcePublication?.artifactId ?? null,
      authoritativeInputDigest: item.authoritativeInputDigest,
    })),
  });
  return { manifestPath, receiptPath };
};

const result = (
  date: string,
  status: "pending" | "unrebuildable",
  reason: string,
  classificationKind = "unavailable",
): HistoricalPromotionPreparationResult => ({
  date,
  status,
  reason,
  classificationKind,
  sourcePublication: null,
  datasetManifest: null,
  datasetManifestBytes: null,
  authoritativeInputDigest: null,
});

const runBounded = async <T>(
  values: readonly string[],
  concurrency: number,
  worker: (value: string) => Promise<T>,
): Promise<readonly T[]> => {
  const output = new Array<T>(values.length);
  let cursor = 0;
  await Promise.all(Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        output[index] = await worker(values[index]!);
      }
    },
  ));
  return output;
};

const writeImmutableOrVerify = (path: string, bytes: Buffer): void => {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  try {
    writeFileSync(path, bytes, { flag: "wx", mode: 0o400 });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error &&
        error.code === "EEXIST" && readFileSync(path).equals(bytes)) {
      return;
    }
    throw error;
  }
};

const writeJsonAtomically = (path: string, value: unknown): void => {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const next = `${path}.next-${process.pid}-${randomUUID()}`;
  writeFileSync(next, `${JSON.stringify(value, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  renameSync(next, path);
};

const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");
