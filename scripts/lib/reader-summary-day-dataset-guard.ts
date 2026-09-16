import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import type { PrismaSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-client";
import type { PrismaReaderSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-client";
import type {
  ReaderSummaryEvidenceSelectorPort,
  ReaderSummaryTimestampPolicy,
} from "@social-monitor/summary/ports";

import {
  captureReaderSummaryDayDatasetManifest,
  manifestsMatch,
  parseReaderSummaryDayDatasetManifest,
  type ReaderSummaryDayDatasetManifest,
} from "./reader-summary-day-dataset-manifest";

// Fresh admission remains 30 minutes. Once admitted, the same guard may run
// for the fixed historical subprocess ceiling, covering the serial assessment,
// generation, publication and bounded outer-process overhead. Child processes
// inherit the same hash-bound admission and cannot renew its deadline.
export const datasetManifestLifetimePolicy = Object.freeze({
  mode: "fresh_admission_bounded_operation_v1",
  maxAdmissionAgeSeconds: 1800,
  maxOperationAgeSeconds: 11760,
} as const);

export const datasetManifestAdmissionJsonEnv =
  "DURABLE_READER_SUMMARY_DATASET_ADMISSION_JSON";
export const datasetManifestAdmissionSha256Env =
  "DURABLE_READER_SUMMARY_DATASET_ADMISSION_SHA256";

export type ReaderSummaryDayDatasetAdmission = Readonly<{
  format: "reader-summary-day-dataset-admission-v1";
  manifestFileSha256: string;
  tenantId: string;
  workspaceId: string;
  periodStartedAt: string;
  periodEndedAt: string;
  timestampPolicy: ReaderSummaryTimestampPolicy;
  admittedAt: string;
  deadlineAt: string;
}>;

export function createReaderSummaryDayDatasetAdmission(params: {
  readonly manifest: ReaderSummaryDayDatasetManifest;
  readonly manifestFileSha256: string;
  readonly admittedAt: Date;
}): ReaderSummaryDayDatasetAdmission {
  const admittedAtMs = params.admittedAt.getTime();
  const generatedAtMs = new Date(params.manifest.generatedAt).getTime();
  if (!Number.isFinite(admittedAtMs) || !Number.isFinite(generatedAtMs) ||
      generatedAtMs > admittedAtMs || admittedAtMs - generatedAtMs >
        datasetManifestLifetimePolicy.maxAdmissionAgeSeconds * 1000) {
    throw new Error("Dataset manifest cannot be admitted outside the freshness window");
  }
  return {
    format: "reader-summary-day-dataset-admission-v1",
    manifestFileSha256: params.manifestFileSha256,
    tenantId: params.manifest.scope.tenantId,
    workspaceId: params.manifest.scope.workspaceId,
    periodStartedAt: params.manifest.period.startedAt,
    periodEndedAt: params.manifest.period.endedAt,
    timestampPolicy: params.manifest.policy.timestampPolicy,
    admittedAt: params.admittedAt.toISOString(),
    deadlineAt: new Date(
      admittedAtMs + datasetManifestLifetimePolicy.maxOperationAgeSeconds * 1000,
    ).toISOString(),
  };
}

export function datasetManifestAdmissionEnvironment(
  admission: ReaderSummaryDayDatasetAdmission,
): Readonly<Record<string, string>> {
  const json = JSON.stringify(admission);
  return {
    [datasetManifestAdmissionJsonEnv]: json,
    [datasetManifestAdmissionSha256Env]: createHash("sha256").update(json).digest("hex"),
  };
}

export function readReaderSummaryDayDatasetAdmission(
  env: Readonly<Record<string, string | undefined>>,
): ReaderSummaryDayDatasetAdmission | undefined {
  const json = env[datasetManifestAdmissionJsonEnv];
  const expectedSha256 = env[datasetManifestAdmissionSha256Env];
  if (json === undefined && expectedSha256 === undefined) return undefined;
  if (json === undefined || expectedSha256 === undefined ||
      createHash("sha256").update(json).digest("hex") !== expectedSha256) {
    throw new Error("Dataset manifest admission envelope hash does not match");
  }
  const value = JSON.parse(json) as ReaderSummaryDayDatasetAdmission;
  if (value.format !== "reader-summary-day-dataset-admission-v1" ||
      !/^[0-9a-f]{64}$/u.test(value.manifestFileSha256) ||
      ![value.tenantId, value.workspaceId, value.periodStartedAt,
        value.periodEndedAt, value.admittedAt, value.deadlineAt]
        .every((item) => typeof item === "string") ||
      (value.timestampPolicy !== "published_at" &&
        value.timestampPolicy !== "observed_at")) {
    throw new Error("Dataset manifest admission envelope is invalid");
  }
  return value;
}

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
  private admittedAtMs: number | undefined;
  private validatedAtMs: number | undefined;

  constructor(
    private readonly client: Pick<PrismaSummaryClient, "$queryRaw">,
    private readonly expected: ReaderSummaryDayDatasetManifest,
    private readonly manifestFileSha256: string,
    private readonly clock: () => Date,
    admission?: ReaderSummaryDayDatasetAdmission,
  ) {
    if (admission !== undefined) {
      assertAdmissionBinding(admission, expected, manifestFileSha256, clock());
      this.admittedAtMs = Date.parse(admission.admittedAt);
    }
  }

  async assertCurrent(phase: DatasetGuardPhase): Promise<void> {
    await this.assertCurrentWithClient(this.client, phase);
  }

  async assertCurrentBeforeMutation(): Promise<void> {
    await this.assertCurrentWithClient(this.client, "before_mutation");
  }

  async assertCurrentForPublicationTransaction(
    client: PrismaReaderSummaryClient,
  ): Promise<void> {
    await lockManifestDatasetTables(client, this.expected.retainedEngagementAuthority !== undefined);
    await this.assertCurrentWithClient(client, "before_publication", true);
  }

  private async assertCurrentWithClient(
    client: Pick<PrismaSummaryClient, "$queryRaw">,
    phase: DatasetGuardPhase | "before_mutation",
    allowPublicationRetry = false,
  ): Promise<void> {
    const expectedPhase = completeDatasetGuardPhases[
      this.completedPhases.length
    ];
    const isPublicationRetry =
      allowPublicationRetry &&
      phase === "before_publication" &&
      this.completedPhases.at(-1) === "before_publication";
    if (phase !== "before_mutation" &&
        phase !== expectedPhase && !isPublicationRetry) {
      throw new Error(
        `Reader summary dataset guard phase ${phase} is out of order`,
      );
    }
    const now = this.clock();
    this.assertLifetime(now.getTime(), phase);
    const actual = await captureReaderSummaryDayDatasetManifest({
      client,
      tenantId: this.expected.scope.tenantId,
      workspaceId: this.expected.scope.workspaceId,
      startedAt: new Date(this.expected.period.startedAt),
      endedAt: new Date(this.expected.period.endedAt),
      generatedAt: now,
      timestampPolicy: this.expected.policy.timestampPolicy,
      ...(this.expected.retainedEngagementAuthority === undefined ? {} : {
        retainedAuthorityBoundThrough: new Date(this.expected.retainedEngagementAuthority.boundThrough),
      }),
    });
    if (!manifestsMatch(this.expected, actual)) {
      throw new Error(`Reader summary dataset changed at ${phase}`);
    }
    const validatedAtMs = this.clock().getTime();
    this.assertLifetime(validatedAtMs, phase, now.getTime());
    if (validatedAtMs < now.getTime()) {
      throw new Error(`Reader summary dataset clock moved backwards at ${phase}`);
    }
    this.admittedAtMs ??= now.getTime();
    this.validatedAtMs = validatedAtMs;
    if (phase !== "before_mutation" && !isPublicationRetry) {
      this.completedPhases.push(phase);
    }
  }

  private assertLifetime(
    nowMs: number,
    phase: string,
    initialAdmissionMs = nowMs,
  ): void {
    const generatedAtMs = new Date(this.expected.generatedAt).getTime();
    const admissionMs = this.admittedAtMs ?? initialAdmissionMs;
    if (
      !Number.isFinite(nowMs) || !Number.isFinite(generatedAtMs) ||
      generatedAtMs > admissionMs ||
      admissionMs - generatedAtMs >
        datasetManifestLifetimePolicy.maxAdmissionAgeSeconds * 1000 ||
      nowMs < (this.validatedAtMs ?? admissionMs) ||
      nowMs - admissionMs >
        datasetManifestLifetimePolicy.maxOperationAgeSeconds * 1000
    ) {
      throw new Error(`Reader summary dataset manifest is stale at ${phase}`);
    }
  }

  evidence() {
    return {
      ...(this.expected.retainedEngagementAuthority === undefined ? {} : {
        retainedEngagementAuthority: {
          mode: this.expected.retainedEngagementAuthority.mode,
          projection: this.expected.retainedEngagementAuthority.projection,
          boundThrough: this.expected.retainedEngagementAuthority.boundThrough,
          bindingsSha256: this.expected.retainedEngagementAuthority.bindingsSha256,
        },
      }),
      lifetimePolicy: datasetManifestLifetimePolicy,
      admittedAt: this.admittedAtMs === undefined
        ? null : new Date(this.admittedAtMs).toISOString(),
      validatedAt: this.validatedAtMs === undefined
        ? null : new Date(this.validatedAtMs).toISOString(),
      manifestFormat: this.expected.format,
      manifestFileSha256: this.manifestFileSha256,
      manifestGeneratedAt: this.expected.generatedAt,
      datasetSha256: this.expected.dataset.aggregateSha256,
      feedRowCount: this.expected.dataset.feedRowCount,
      providerCounts: this.expected.dataset.providerCounts,
      timestampPolicy: this.expected.policy.timestampPolicy,
      githubEligibilityRowCount:
        this.expected.dataset.githubEligibilityRowCount,
      completedPhases: [...this.completedPhases],
    };
  }

  retainedEngagementAuthority() {
    return this.expected.retainedEngagementAuthority;
  }

  timestampPolicy(): ReaderSummaryTimestampPolicy {
    return this.expected.policy.timestampPolicy;
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
  retainedAuthority: boolean,
): Promise<void> {
  if (!("$executeRaw" in client) || typeof client.$executeRaw !== "function") {
    throw new Error(
      "Dataset-guarded publication requires a lock-capable Prisma transaction",
    );
  }
  const lockClient = client as LockCapableReaderSummaryClient;
  if (retainedAuthority) {
    // Follow projection's snapshot -> source -> feed direction. NOWAIT on the
    // complete set aborts on any conflict instead of waiting with partial locks.
    await lockClient.$executeRaw`
      lock table source_item_engagement_snapshots, source_item_engagement_observations,
        source_items, feed_items,
        source_bindings, interests, source_catalog_entries
      in share mode nowait
    `;
    return;
  }
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
    private readonly authorizedHistoricalRebuild = false,
  ) {}

  async select(
    params: Parameters<ReaderSummaryEvidenceSelectorPort["select"]>[0],
  ) {
    const timestampPolicy = this.guard.timestampPolicy();
    if (
      params.timestampPolicy !== undefined &&
      params.timestampPolicy !== timestampPolicy
    ) {
      throw new Error(
        "Reader summary evidence timestamp policy does not match dataset manifest",
      );
    }
    await this.guard.assertCurrent("before_evidence_selection");
    if (params.retainedEngagementAuthority !== undefined) {
      throw new Error("Historical retained authority must originate in the dataset guard");
    }
    const authority = this.authorizedHistoricalRebuild
      ? this.guard.retainedEngagementAuthority() : undefined;
    const selection = await this.delegate.select({
      ...params,
      timestampPolicy,
      ...(authority === undefined ? {} : { retainedEngagementAuthority: authority }),
    });
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
  readonly expectedTimestampPolicy?: ReaderSummaryTimestampPolicy;
  readonly maxAgeMs?: number;
  readonly admission?: ReaderSummaryDayDatasetAdmission;
}): {
  readonly manifest: ReaderSummaryDayDatasetManifest;
  readonly fileSha256: string;
} {
  const bytes = readFileSync(params.path);
  const fileSha256 = createHash("sha256").update(bytes).digest("hex");
  if (fileSha256 !== params.expectedFileSha256) {
    throw new Error("Dataset manifest file hash does not match");
  }
  const value = parseReaderSummaryDayDatasetManifest(bytes);
  const generatedAt = new Date(value.generatedAt);
  if (params.admission !== undefined) {
    assertAdmissionBinding(params.admission, value, fileSha256, params.now);
  }
  const maxAgeMs = params.maxAgeMs ?? datasetManifestLifetimePolicy.maxAdmissionAgeSeconds * 1000;
  if (
    value.scope.tenantId !== params.tenantId ||
    value.scope.workspaceId !== params.workspaceId ||
    value.period.startedAt !== params.startedAt.toISOString() ||
    value.period.endedAt !== params.endedAt.toISOString() ||
    value.policy.timestampPolicy !==
      (params.expectedTimestampPolicy ?? "published_at") ||
    !Number.isFinite(params.now.getTime()) ||
    !Number.isFinite(generatedAt.getTime()) ||
    generatedAt.getTime() > params.now.getTime() ||
    (params.admission === undefined &&
      params.now.getTime() - generatedAt.getTime() > maxAgeMs)
  ) {
    throw new Error("Dataset manifest scope, period or freshness is invalid");
  }
  return { manifest: value, fileSha256 };
}

function assertAdmissionBinding(
  admission: ReaderSummaryDayDatasetAdmission,
  manifest: ReaderSummaryDayDatasetManifest,
  manifestFileSha256: string,
  now: Date,
): void {
  const admittedAtMs = Date.parse(admission.admittedAt);
  const deadlineAtMs = Date.parse(admission.deadlineAt);
  const generatedAtMs = Date.parse(manifest.generatedAt);
  if (admission.manifestFileSha256 !== manifestFileSha256 ||
      admission.tenantId !== manifest.scope.tenantId ||
      admission.workspaceId !== manifest.scope.workspaceId ||
      admission.periodStartedAt !== manifest.period.startedAt ||
      admission.periodEndedAt !== manifest.period.endedAt ||
      admission.timestampPolicy !== manifest.policy.timestampPolicy ||
      ![admittedAtMs, deadlineAtMs, generatedAtMs, now.getTime()].every(Number.isFinite) ||
      admittedAtMs < generatedAtMs ||
      admittedAtMs - generatedAtMs >
        datasetManifestLifetimePolicy.maxAdmissionAgeSeconds * 1000 ||
      deadlineAtMs !== admittedAtMs +
        datasetManifestLifetimePolicy.maxOperationAgeSeconds * 1000 ||
      now.getTime() < admittedAtMs || now.getTime() > deadlineAtMs) {
    throw new Error("Dataset manifest admission envelope binding is invalid or expired");
  }
}
