import type { PrismaReaderSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-client";
import { PrismaReaderSummaryGitHubProjectionReader } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-github-projection.reader";
import { readerSummaryArtifactFromPrisma } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-records";
import { githubProjectionItemTouchesDay } from "@social-monitor/summary/domain/policies/reader-summary-github-projection-candidates";
import type { ReaderSummaryPublicationDecision } from "@social-monitor/summary/domain";
import type {
  ReadReaderSummaryGitHubProjectionResult,
  ReaderSummaryRecoveryFinalizationCommand,
} from "@social-monitor/summary/ports";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { captureReaderSummaryDayDatasetManifest } from "./reader-summary-day-dataset-manifest";
import {
  historicalDegradedRecoveryTenantId,
  historicalDegradedRecoveryWorkspaceId,
  historicalDegradedRecoveryExpectedDataset,
  prepareHistoricalDegradedRecoveryAuthority,
  sha256,
  stableJson,
  type HistoricalDegradedRecoveryAuthority,
  type HistoricalDegradedRecoveryDatasetSnapshot,
  type HistoricalDegradedRecoveryPreparation,
  type HistoricalDegradedRecoverySourceSnapshot,
} from "./reader-summary-historical-degraded-recovery-authority";
import type {
  HistoricalDegradedRecoveryFiles,
  HistoricalDegradedRecoveryLiveVerification,
  HistoricalDegradedRecoveryLiveVerifier,
} from "./reader-summary-historical-degraded-recovery-execution";
import { recoveryIdentities } from "./reader-summary-historical-degraded-recovery-execution";
import {
  historicalDegradedRecoveryPublicationBinding,
  verifyHistoricalDegradedRecoveryPublicationSlot,
} from "./reader-summary-historical-degraded-recovery-slot";

type SourceRow = Readonly<{
  jobId: string;
  artifactId: string;
  jobStatus: string;
  artifactStatus: string;
  summaryText: string | null;
  qualitySignals: unknown;
  sourceRecord: unknown;
}>;

type SlotRow = Readonly<{
  existingPublicationCount: number;
  activeSlotCount: number;
}>;

type UniqueRow = Readonly<{ uniqueCount: number }>;

export type HistoricalDegradedRecoveryServingAuthorityReader = () =>
  Promise<Readonly<Record<string, unknown>>>;

export class PrismaHistoricalDegradedRecoveryLiveVerifier
  implements HistoricalDegradedRecoveryLiveVerifier
{
  constructor(
    private readonly client: PrismaReaderSummaryClient,
    private readonly readServingAuthority:
      HistoricalDegradedRecoveryServingAuthorityReader,
  ) {}

  async capture(params: Readonly<{
    requestedUtcDate: string;
    files: HistoricalDegradedRecoveryFiles;
    authorizedAt: Date;
    observedThrough?: Date;
    replay?: Readonly<{ publicationId: string; authoritySha256: string }>;
  }>): Promise<HistoricalDegradedRecoveryPreparation> {
    const startedAt = exactStart(params.requestedUtcDate);
    const endedAt = new Date(startedAt.getTime() + 86_400_000);
    const observedThrough = params.observedThrough ?? params.authorizedAt;
    const sourceCandidates = await this.readSourceCandidates(startedAt, endedAt);
    const slot = await this.readSlot(startedAt, endedAt, params.replay);
    const liveManifest = await captureReaderSummaryDayDatasetManifest({
      client: this.client,
      tenantId: tenantId(historicalDegradedRecoveryTenantId),
      workspaceId: workspaceId(historicalDegradedRecoveryWorkspaceId),
      startedAt,
      endedAt,
      generatedAt: params.authorizedAt,
      timestampPolicy: "published_at",
    });
    const uniqueCount = await this.readUniqueCount(startedAt, endedAt);
    const dataset: HistoricalDegradedRecoveryDatasetSnapshot = {
      liveCount: liveManifest.dataset.feedRowCount,
      uniqueCount,
      aggregateSha256: liveManifest.dataset.aggregateSha256,
      providerCounts: liveManifest.dataset.providerCounts,
    };
    verifyHistoricalDegradedRecoveryInputArtifacts({
      requestedUtcDate: params.requestedUtcDate,
      files: params.files,
      dataset,
      authorizedAt: params.authorizedAt,
    });
    const githubZero = await this.readGitHubZero({
      startedAt,
      endedAt,
      observedThrough,
    });
    return {
      requestedUtcDate: params.requestedUtcDate,
      sourceCandidates,
      existingPublicationCount: slot.existingPublicationCount,
      activeSlotCount: slot.activeSlotCount,
      collectionArtifactBytes: params.files.collectionArtifactBytes,
      collectionQualityReportBytes: params.files.collectionQualityReportBytes,
      datasetManifestBytes: params.files.datasetManifestBytes,
      dataset,
      githubZero,
      servingAuthority: await this.readServingAuthority(),
      authorizedAt: params.authorizedAt,
    };
  }

  async verify(params: Readonly<{
    authority: HistoricalDegradedRecoveryAuthority;
    authoritySha256: string;
    files: HistoricalDegradedRecoveryFiles;
  }>): Promise<HistoricalDegradedRecoveryLiveVerification> {
    const captured = await this.capture({
      requestedUtcDate: params.authority.requestedUtcDate,
      files: params.files,
      authorizedAt: new Date(params.authority.authorizedAt),
      observedThrough: new Date(params.authority.githubZero.observedThrough),
      replay: {
        publicationId: recoveryIdentities(params.authority.attempt.identity).artifactId,
        authoritySha256: params.authoritySha256,
      },
    });
    const current = prepareHistoricalDegradedRecoveryAuthority(captured);
    if (current.sha256 !== params.authoritySha256) {
      throw new Error("Historical degraded recovery live authority changed before use");
    }
    const record = await this.client.readerSummaryArtifact.findFirst({
      where: {
        tenantId: historicalDegradedRecoveryTenantId,
        workspaceId: historicalDegradedRecoveryWorkspaceId,
        id: params.authority.source.artifactId,
        status: { in: ["REJECTED"] },
      },
    });
    if (record === null) {
      throw new Error("Historical degraded recovery rejected source artifact disappeared");
    }
    return {
      sourceArtifact: readerSummaryArtifactFromPrisma(record),
      sourcePublicationDecision: rejectedDecision(record.qualitySignals),
    };
  }

  async verifyPublicationSlot(params: Readonly<{
    authority: HistoricalDegradedRecoveryAuthority;
    authoritySha256: string;
    command: ReaderSummaryRecoveryFinalizationCommand;
  }>): Promise<"empty" | "replay"> {
    const binding = historicalDegradedRecoveryPublicationBinding(
      params.command,
    );
    if (
      params.command.provenance.priorCollectionProof.sourceAttempt.sha256 !==
      params.authoritySha256
    ) {
      throw new Error(
        "Historical degraded recovery publication does not bind the authority",
      );
    }
    return verifyHistoricalDegradedRecoveryPublicationSlot({
      client: this.client,
      authority: params.authority,
      binding,
    });
  }

  private async readSourceCandidates(
    startedAt: Date,
    endedAt: Date,
  ): Promise<readonly HistoricalDegradedRecoverySourceSnapshot[]> {
    const rows = await this.client.$queryRaw<readonly SourceRow[]>`
      SELECT
        job.id::TEXT AS "jobId",
        artifact.id::TEXT AS "artifactId",
        job.status::TEXT AS "jobStatus",
        artifact.status::TEXT AS "artifactStatus",
        artifact.summary_text AS "summaryText",
        artifact.quality_signals AS "qualitySignals",
        jsonb_build_object(
          'job', to_jsonb(job),
          'artifact', to_jsonb(artifact)
        ) AS "sourceRecord"
      FROM reader_summary_jobs AS job
      JOIN reader_summary_artifacts AS artifact
        ON artifact.id = job.reader_summary_artifact_id
       AND artifact.tenant_id = job.tenant_id
       AND artifact.workspace_id = job.workspace_id
      WHERE job.tenant_id = ${historicalDegradedRecoveryTenantId}::UUID
        AND job.workspace_id = ${historicalDegradedRecoveryWorkspaceId}::UUID
        AND job.scope_type = 'workspace'
        AND job.scope_key = 'workspace'
        AND job.cadence = 'daily'
        AND job.period_started_at = ${startedAt}
        AND job.period_ended_at = ${endedAt}
        AND job.period_timezone = 'UTC'
        AND job.status = 'REJECTED'
        AND artifact.status = 'REJECTED'
      ORDER BY job.id, artifact.id
    `;
    return rows.map(sourceSnapshot);
  }

  private async readSlot(
    startedAt: Date,
    endedAt: Date,
    replay?: Readonly<{ publicationId: string; authoritySha256: string }>,
  ): Promise<SlotRow> {
    const replayPublicationId = replay?.publicationId ?? null;
    const replayAuthoritySha256 = replay?.authoritySha256 ?? null;
    const rows = await this.client.$queryRaw<readonly SlotRow[]>`
      SELECT
        (SELECT count(*)::INTEGER
           FROM reader_summary_publications
          WHERE tenant_id = ${historicalDegradedRecoveryTenantId}::UUID
            AND workspace_id = ${historicalDegradedRecoveryWorkspaceId}::UUID
            AND scope_type = 'workspace' AND scope_key = 'workspace'
            AND cadence = 'daily' AND period_started_at = ${startedAt}
            AND period_ended_at = ${endedAt} AND period_timezone = 'UTC'
            AND (
              ${replayPublicationId}::UUID IS NULL
              OR id <> ${replayPublicationId}::UUID
              OR NOT EXISTS (
                SELECT 1 FROM reader_summary_recovery_receipts AS receipt
                WHERE receipt.publication_id = reader_summary_publications.id
                  AND receipt.provenance->'priorCollectionProof'
                    ->'sourceAttempt'->>'sha256' = ${replayAuthoritySha256}
              )
            ))
          AS "existingPublicationCount",
        (SELECT count(*)::INTEGER
           FROM reader_summary_publication_slots
          WHERE tenant_id = ${historicalDegradedRecoveryTenantId}::UUID
            AND workspace_id = ${historicalDegradedRecoveryWorkspaceId}::UUID
            AND scope_type = 'workspace' AND scope_key = 'workspace'
            AND cadence = 'daily' AND period_started_at = ${startedAt}
            AND period_ended_at = ${endedAt} AND period_timezone = 'UTC'
            AND current_publication_id IS NOT NULL
            AND (
              ${replayPublicationId}::UUID IS NULL
              OR current_publication_id <> ${replayPublicationId}::UUID
            )) AS "activeSlotCount"
    `;
    if (rows.length !== 1 || rows[0] === undefined) {
      throw new Error("Historical degraded recovery slot reader failed");
    }
    return rows[0];
  }

  private async readUniqueCount(startedAt: Date, endedAt: Date): Promise<number> {
    const rows = await this.client.$queryRaw<readonly UniqueRow[]>`
      SELECT count(DISTINCT fi.canonical_url)::INTEGER AS "uniqueCount"
      FROM feed_items AS fi
      WHERE fi.tenant_id = ${historicalDegradedRecoveryTenantId}::UUID
        AND fi.workspace_id = ${historicalDegradedRecoveryWorkspaceId}::UUID
        AND fi.status = 'VISIBLE'
        AND fi.published_at >= ${startedAt}
        AND fi.published_at < ${endedAt}
    `;
    if (rows.length !== 1 || rows[0] === undefined) {
      throw new Error("Historical degraded recovery dataset reader failed");
    }
    return rows[0].uniqueCount;
  }

  private async readGitHubZero(params: {
    readonly startedAt: Date;
    readonly endedAt: Date;
    readonly observedThrough: Date;
  }) {
    const result = await new PrismaReaderSummaryGitHubProjectionReader(
      this.client,
    ).read({
      tenantId: tenantId(historicalDegradedRecoveryTenantId),
      workspaceId: workspaceId(historicalDegradedRecoveryWorkspaceId),
      dayStartedAt: params.startedAt,
      dayEndedAt: params.endedAt,
      observedThrough: params.observedThrough,
    });
    return buildHistoricalDegradedGitHubZero({ ...params, result });
  }
}

export const buildHistoricalDegradedGitHubZero = (params: {
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly observedThrough: Date;
  readonly result: ReadReaderSummaryGitHubProjectionResult;
}) => {
  const touchingRequestedDayCount = params.result.items.filter((item) =>
    githubProjectionItemTouchesDay(item, params.startedAt, params.endedAt),
  ).length;
  const firstLaterObservation = [...params.result.items]
    .map((item) => item.observedAt.toISOString())
    .sort()[0];
  if (
    touchingRequestedDayCount !== 0 ||
    !Number.isSafeInteger(params.result.pageCount) ||
    params.result.pageCount < 1
  ) {
    throw new Error(
      "Historical degraded recovery GitHub reader did not prove requested-day zero",
    );
  }
  const projection = {
    eligibleBindingIds: [...params.result.eligibleBindingIds],
    items: params.result.items.map(canonicalProjectionItem),
    pageCount: params.result.pageCount,
  };
  return {
    readerStatus: "ok" as const,
    observedThrough: params.observedThrough.toISOString(),
    pageCount: params.result.pageCount,
    scannedItemCount: params.result.items.length,
    touchingRequestedDayCount: 0 as const,
    eligibleBindingIds: params.result.eligibleBindingIds,
    ...(firstLaterObservation === undefined ? {} : { firstLaterObservation }),
    projectionSha256: sha256(stableJson(projection)),
  };
};

const canonicalProjectionItem = (
  item: ReadReaderSummaryGitHubProjectionResult["items"][number],
) => ({
  feedItemId: item.feedItemId,
  sourceItemId: item.sourceItemId,
  sourceBindingId: item.sourceBindingId,
  providerKey: item.providerKey,
  metadataKind: item.metadataKind ?? null,
  scanJobId: item.scanJobId ?? null,
  canonicalUrl: item.canonicalUrl,
  repositoryFullName: item.repositoryFullName ?? null,
  rank: item.rank ?? null,
  starsGained: item.starsGained ?? null,
  window: item.window ?? null,
  fetchStartedAt: canonicalProjectionDate(item.fetchStartedAt),
  checkedAt: canonicalProjectionDate(item.checkedAt),
  publishedAt: canonicalProjectionDate(item.publishedAt),
  observedAt: canonicalProjectionDate(item.observedAt),
  sourceContentHash: item.sourceContentHash,
  sourceProviderContentHash: item.sourceProviderContentHash,
});

const canonicalProjectionDate = (value: Date | undefined): string | null => {
  if (value === undefined) return null;
  if (!Number.isFinite(value.getTime())) {
    throw new Error(
      "Historical degraded recovery GitHub projection contains an invalid timestamp",
    );
  }
  return value.toISOString();
};

const sourceSnapshot = (row: SourceRow): HistoricalDegradedRecoverySourceSnapshot => {
  const decision = rejectedDecision(row.qualitySignals);
  const signals = record(row.qualitySignals, "source quality signals");
  const flags = stringArray(signals.qualityFlags, "source quality flags");
  if (row.jobStatus !== "REJECTED" || row.artifactStatus !== "REJECTED") {
    throw new Error("Historical degraded recovery source status changed");
  }
  return {
    jobId: row.jobId,
    artifactId: row.artifactId,
    jobStatus: "REJECTED",
    artifactStatus: "REJECTED",
    qualityFlags: flags,
    publicationDecision: decision,
    summaryText: row.summaryText ?? "",
    sourceRecordSha256: sha256(stableJson(row.sourceRecord)),
  };
};

const rejectedDecision = (
  qualitySignals: unknown,
): Extract<ReaderSummaryPublicationDecision, { readonly status: "rejected" }> => {
  const signals = record(qualitySignals, "source quality signals");
  const value = record(signals.publicationDecision, "source publication decision");
  if (value.status !== "rejected" || value.qualityPassed !== false) {
    throw new Error("Historical degraded recovery source publication decision is not rejected");
  }
  return value as Extract<ReaderSummaryPublicationDecision, { readonly status: "rejected" }>;
};

export const verifyHistoricalDegradedRecoveryInputArtifacts = (params: {
  readonly requestedUtcDate: string;
  readonly files: HistoricalDegradedRecoveryFiles;
  readonly dataset: HistoricalDegradedRecoveryDatasetSnapshot;
  readonly authorizedAt: Date;
}): void => {
  const collection = jsonRecord(params.files.collectionArtifactBytes, "collection artifact");
  const quality = jsonRecord(params.files.collectionQualityReportBytes, "collection quality report");
  const manifest = jsonRecord(params.files.datasetManifestBytes, "dataset manifest");
  const manifestDataset = record(manifest.dataset, "manifest dataset");
  const manifestScope = record(manifest.scope, "manifest scope");
  const manifestPeriod = record(manifest.period, "manifest period");
  const collectionInputs = record(collection.inputs, "collection inputs");
  const collectionScope = record(collectionInputs.scope, "collection scope");
  const collectionWindow = record(collection.targetWindow, "collection target window");
  const qualityInputs = record(quality.inputs, "quality inputs");
  const qualityFreshness = record(
    qualityInputs.historicalRegenerationFreshness,
    "quality regeneration freshness",
  );
  const generatedAt = new Date(String(manifest.generatedAt));
  const expected = historicalDegradedRecoveryExpectedDataset(
    params.requestedUtcDate,
  );
  const baseCollection = params.requestedUtcDate === "2026-08-18"
    ? { count: 205, xCount: 0 }
    : { count: 226, xCount: 10 };
  if (
    collection.artifactFormat !== "reader-summary-clean-real-day-collection-v1" ||
    record(collection.run, "collection run").collectionDate !== params.requestedUtcDate ||
    collection.blockingPassed !== true ||
    collectionScope.tenantId !== historicalDegradedRecoveryTenantId ||
    collectionScope.workspaceId !== historicalDegradedRecoveryWorkspaceId ||
    collectionWindow.feedItemCount !== baseCollection.count ||
    Number(
      record(collectionWindow.providerCounts, "collection provider counts")[
        "x-twitter"
      ] ?? 0,
    ) !== baseCollection.xCount ||
    quality.artifactFormat !== "yesterday-social-collection-quality-report-v1" ||
    quality.collectionDate !== params.requestedUtcDate ||
    quality.collectionBlockingPassed !== true ||
    qualityFreshness.mode !== "historical_regeneration_current_snapshot" ||
    qualityFreshness.generalAllowHistorical !== false ||
    qualityFreshness.manifestFileSha256 !== sha256(params.files.datasetManifestBytes) ||
    qualityFreshness.datasetSha256 !== params.dataset.aggregateSha256 ||
    manifest.format !== "reader-summary-day-dataset-manifest-v1" ||
    manifestScope.tenantId !== historicalDegradedRecoveryTenantId ||
    manifestScope.workspaceId !== historicalDegradedRecoveryWorkspaceId ||
    manifestPeriod.startedAt !== `${params.requestedUtcDate}T00:00:00.000Z` ||
    manifestPeriod.endedAt !== new Date(
      Date.parse(`${params.requestedUtcDate}T00:00:00.000Z`) + 86_400_000,
    ).toISOString() ||
    manifestPeriod.timezone !== "UTC" ||
    manifestDataset.feedRowCount !== params.dataset.liveCount ||
    manifestDataset.aggregateSha256 !== params.dataset.aggregateSha256 ||
    stableJson(manifestDataset.providerCounts) !== stableJson(params.dataset.providerCounts) ||
    params.dataset.liveCount !== expected.count ||
    params.dataset.uniqueCount !== expected.count ||
    stableJson(params.dataset.providerCounts) !==
      stableJson(expected.providerCounts) ||
    !Number.isFinite(generatedAt.getTime()) ||
    generatedAt.getTime() > params.authorizedAt.getTime() ||
    params.authorizedAt.getTime() - generatedAt.getTime() > 1_800_000
  ) {
    throw new Error("Historical degraded recovery input artifacts do not match fresh live truth");
  }
};

const jsonRecord = (bytes: Buffer, label: string): Readonly<Record<string, unknown>> => {
  try { return record(JSON.parse(bytes.toString("utf8")), label); } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${label} is not JSON`);
    throw error;
  }
};

const record = (value: unknown, label: string): Readonly<Record<string, unknown>> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value as Readonly<Record<string, unknown>>;
};

const stringArray = (value: unknown, label: string): readonly string[] => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} is invalid`);
  }
  return value as readonly string[];
};

const exactStart = (date: string): Date => {
  const value = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(value.getTime()) || value.toISOString().slice(0, 10) !== date) {
    throw new Error("Historical degraded recovery date is invalid");
  }
  return value;
};
