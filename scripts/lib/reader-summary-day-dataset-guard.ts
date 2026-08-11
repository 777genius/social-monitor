import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import type { PrismaSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-client";
import type { PrismaReaderSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-client";
import type { ReaderSummaryEvidenceSelectorPort } from "@social-monitor/summary/ports";

import {
  captureReaderSummaryDayDatasetManifest,
  manifestsMatch,
  readerSummaryDayDatasetManifestFormat,
  type ReaderSummaryDayDatasetManifest,
} from "./reader-summary-day-dataset-manifest";

export type DatasetGuardPhase =
  | "before_evidence_selection"
  | "after_evidence_selection"
  | "before_publication";

export const completeDatasetGuardPhases: readonly DatasetGuardPhase[] = [
  "before_evidence_selection",
  "after_evidence_selection",
  "before_publication",
];

export class ReaderSummaryDayDatasetGuard {
  private readonly completedPhases: DatasetGuardPhase[] = [];

  constructor(
    private readonly client: Pick<PrismaSummaryClient, "$queryRaw">,
    private readonly expected: ReaderSummaryDayDatasetManifest,
    private readonly manifestFileSha256: string,
    private readonly clock: () => Date,
  ) {}

  async assertCurrent(phase: DatasetGuardPhase): Promise<void> {
    await this.assertCurrentWithClient(this.client, phase);
  }

  async assertCurrentForPublicationTransaction(
    client: PrismaReaderSummaryClient,
  ): Promise<void> {
    await lockManifestDatasetTables(client);
    await this.assertCurrentWithClient(client, "before_publication", true);
  }

  private async assertCurrentWithClient(
    client: Pick<PrismaSummaryClient, "$queryRaw">,
    phase: DatasetGuardPhase,
    allowPublicationRetry = false,
  ): Promise<void> {
    const expectedPhase =
      completeDatasetGuardPhases[this.completedPhases.length];
    const isPublicationRetry =
      allowPublicationRetry &&
      phase === "before_publication" &&
      this.completedPhases.at(-1) === "before_publication";
    if (phase !== expectedPhase && !isPublicationRetry) {
      throw new Error(
        `Reader summary dataset guard phase ${phase} is out of order`,
      );
    }
    const now = this.clock();
    const manifestGeneratedAt = new Date(this.expected.generatedAt);
    if (
      !Number.isFinite(manifestGeneratedAt.getTime()) ||
      manifestGeneratedAt.getTime() > now.getTime() ||
      now.getTime() - manifestGeneratedAt.getTime() > 30 * 60 * 1_000
    ) {
      throw new Error(`Reader summary dataset manifest is stale at ${phase}`);
    }
    const actual = await captureReaderSummaryDayDatasetManifest({
      client,
      tenantId: this.expected.scope.tenantId,
      workspaceId: this.expected.scope.workspaceId,
      startedAt: new Date(this.expected.period.startedAt),
      endedAt: new Date(this.expected.period.endedAt),
      generatedAt: now,
    });
    if (!manifestsMatch(this.expected, actual)) {
      throw new Error(`Reader summary dataset changed at ${phase}`);
    }
    if (!isPublicationRetry) {
      this.completedPhases.push(phase);
    }
  }

  evidence() {
    return {
      manifestFormat: this.expected.format,
      manifestFileSha256: this.manifestFileSha256,
      manifestGeneratedAt: this.expected.generatedAt,
      datasetSha256: this.expected.dataset.aggregateSha256,
      feedRowCount: this.expected.dataset.feedRowCount,
      providerCounts: this.expected.dataset.providerCounts,
      githubEligibilityRowCount:
        this.expected.dataset.githubEligibilityRowCount,
      completedPhases: [...this.completedPhases],
    };
  }
}

type LockCapableReaderSummaryClient = PrismaReaderSummaryClient & {
  readonly $executeRaw: (
    query: TemplateStringsArray,
    ...values: readonly unknown[]
  ) => Promise<number>;
};

async function lockManifestDatasetTables(
  client: PrismaReaderSummaryClient,
): Promise<void> {
  if (!("$executeRaw" in client) || typeof client.$executeRaw !== "function") {
    throw new Error(
      "Dataset-guarded publication requires a lock-capable Prisma transaction",
    );
  }
  const lockClient = client as LockCapableReaderSummaryClient;
  await lockClient.$executeRaw`
    lock table
      feed_items,
      source_items,
      source_bindings,
      interests,
      source_catalog_entries
    in share mode
  `;
}

export class DatasetGuardedReaderSummaryEvidenceSelector implements ReaderSummaryEvidenceSelectorPort {
  constructor(
    private readonly delegate: ReaderSummaryEvidenceSelectorPort,
    private readonly guard: ReaderSummaryDayDatasetGuard,
  ) {}

  async select(
    params: Parameters<ReaderSummaryEvidenceSelectorPort["select"]>[0],
  ) {
    await this.guard.assertCurrent("before_evidence_selection");
    const selection = await this.delegate.select(params);
    await this.guard.assertCurrent("after_evidence_selection");
    return selection;
  }
}

export function readReaderSummaryDayDatasetManifest(params: {
  readonly path: string;
  readonly expectedFileSha256: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly now: Date;
  readonly maxAgeMs?: number;
}): {
  readonly manifest: ReaderSummaryDayDatasetManifest;
  readonly fileSha256: string;
} {
  const bytes = readFileSync(params.path);
  const fileSha256 = createHash("sha256").update(bytes).digest("hex");
  if (fileSha256 !== params.expectedFileSha256) {
    throw new Error("Dataset manifest file hash does not match");
  }
  const value = parseManifest(bytes);
  const generatedAt = new Date(value.generatedAt);
  const maxAgeMs = params.maxAgeMs ?? 30 * 60 * 1_000;
  if (
    value.scope.tenantId !== params.tenantId ||
    value.scope.workspaceId !== params.workspaceId ||
    value.period.startedAt !== params.startedAt.toISOString() ||
    value.period.endedAt !== params.endedAt.toISOString() ||
    !Number.isFinite(generatedAt.getTime()) ||
    generatedAt.getTime() > params.now.getTime() ||
    params.now.getTime() - generatedAt.getTime() > maxAgeMs
  ) {
    throw new Error("Dataset manifest scope, period or freshness is invalid");
  }
  return { manifest: value, fileSha256 };
}

function parseManifest(bytes: Buffer): ReaderSummaryDayDatasetManifest {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    throw new Error("Dataset manifest is not valid JSON");
  }
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.format !== readerSummaryDayDatasetManifestFormat ||
    !isRecord(value.scope) ||
    !isRecord(value.period) ||
    value.period.timezone !== "UTC" ||
    !isRecord(value.dataset) ||
    typeof value.dataset.feedRowCount !== "number" ||
    !isRecord(value.dataset.providerCounts) ||
    typeof value.dataset.feedRowsSha256 !== "string" ||
    typeof value.dataset.githubEligibilityRowCount !== "number" ||
    typeof value.dataset.githubEligibilitySha256 !== "string" ||
    typeof value.dataset.aggregateSha256 !== "string" ||
    !isRecord(value.policy) ||
    value.policy.githubRowsIncluded !== true ||
    value.policy.githubEligibilityIncluded !== true ||
    !isRecord(value.redaction) ||
    Object.values(value.redaction).some((item) => item !== false)
  ) {
    throw new Error("Dataset manifest contract is invalid");
  }
  return value as unknown as ReaderSummaryDayDatasetManifest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
