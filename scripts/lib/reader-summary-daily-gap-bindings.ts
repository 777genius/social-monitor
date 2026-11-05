import { readerSummaryArtifactFromPrisma } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-records";
import {
  readerSummaryHasVerifiedGitHubProjection,
  readerSummaryIsOrdinaryNoSignalWithoutEvidence,
  type ReaderSummaryGitHubProjectionAudit,
} from "@social-monitor/summary/domain/policies/reader-summary-github-projection-audit";

import { buildCurrentPublicArtifactSnapshot } from "./reader-summary-current-publication-bindings";
import {
  canonicalJson,
  canonicalJsonSha256,
  dailyPeriodKey,
} from "./reader-summary-quality-eval-support";

export type DailyGapPublicationRow =
  Parameters<typeof buildCurrentPublicArtifactSnapshot>[0]["rows"][number] & {
    readonly currentPublicationId: string;
    readonly publicationKind: string;
    readonly semanticStatus: string;
    readonly publicationArtifactId: string;
    readonly publicationModelVersion: string;
  };

export function assertDailyGapPublicationBindings(params: {
  readonly rows: readonly DailyGapPublicationRow[];
  readonly collectionDates: readonly string[];
  readonly databaseUrl: string;
  readonly scope: { readonly tenantId: string; readonly workspaceId: string };
}): void {
  const { rows, collectionDates } = params;
  if (rows.length !== collectionDates.length || rows.length === 0 ||
      new Set(collectionDates).size !== collectionDates.length ||
      new Set(rows.map((row) => row.publicationId)).size !== rows.length ||
      new Set(rows.map((row) => row.id)).size !== rows.length) {
    throw new Error("Daily gap publications do not cover every requested date exactly once");
  }
  const capturedAt = timestamp(rows[0]!.capturedAt);
  for (const [index, row] of rows.entries()) {
    const date = collectionDates[index]!;
    const start = `${date}T00:00:00.000Z`;
    const end = new Date(Date.parse(start) + 86_400_000).toISOString();
    if (row.collectionDate !== date ||
        (index > 0 && collectionDates[index - 1]! >= date) ||
        timestamp(row.capturedAt) !== capturedAt ||
        row.tenantId !== params.scope.tenantId ||
        row.workspaceId !== params.scope.workspaceId ||
        row.scopeType !== "workspace" || row.scopeKey !== "workspace" ||
        row.cadence !== "daily" || row.periodTimezone !== "UTC" ||
        row.periodKey !== dailyPeriodKey(date) ||
        timestamp(row.periodStartedAt) !== start ||
        timestamp(row.periodEndedAt) !== end ||
        row.publicationKind !== "EXACT" ||
        row.currentPublicationId !== row.publicationId ||
        row.publicationArtifactId !== row.id ||
        row.publicationModelVersion !== row.modelVersion ||
        typeof row.modelVersion !== "string" || row.modelVersion.trim().length === 0 ||
        typeof row.promptVersion !== "string" || row.promptVersion.trim().length === 0 ||
        row.semanticStatus !== row.status ||
        !["COMPLETED", "NO_SIGNAL"].includes(row.status)) {
      throw new Error(`Daily gap publication binding drifted for ${date}`);
    }
    for (const id of [row.publicationId, row.id, row.publicationReaderSummaryJobId]) {
      if (typeof id !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(id)) {
        throw new Error(`Daily gap publication identity is invalid for ${date}`);
      }
    }
    if (row.status === "COMPLETED") {
      // Preserve every existing successful-summary/projection check per day.
      buildCurrentPublicArtifactSnapshot({
        rows: [row],
        collectionDates: [date],
        databaseUrl: params.databaseUrl,
        scope: { ...params.scope, scopeType: "workspace", scopeKey: "workspace" },
      });
    } else {
      assertNoSignalProof(row, date, start, end);
      assertNoSignalSemantics(row, date);
    }
  }
}

function assertNoSignalProof(
  row: DailyGapPublicationRow, date: string, start: string, end: string,
): void {
  const requestedAt = timestamp(row.publicationRequestedAt);
  const report = {
    schemaVersion: "reader_summary.publication_report.v1",
    semanticStatus: row.status,
    modelVersion: row.modelVersion,
    promptVersion: row.promptVersion,
    headline: row.headline,
    summaryText: row.summaryText,
    artifactPayload: row.artifactPayload,
    citations: row.citations,
    qualitySignals: row.qualitySignals,
  };
  if (!/^[0-9a-f]{64}$/u.test(row.reportSha256) ||
      canonicalJsonSha256(report) !== row.reportSha256) {
    throw new Error(`Daily gap publication report hash drifted for ${date}`);
  }
  // Equality to the complete v1 proof also rejects missing and extra keys,
  // including nested scope/period keys. Keep both supported request-date modes.
  const expectedProof = {
    schemaVersion: "reader_summary.publication_proof.v1",
    tenantId: row.tenantId,
    workspaceId: row.workspaceId,
    scope: { type: "workspace", key: "workspace" },
    period: {
      cadence: "daily", startedAt: start, endedAt: end,
      timezone: "UTC", periodKey: row.periodKey,
    },
    requestedUtcDate: row.publicationRequestedUtcDate,
    requestedAt,
    readerSummaryJobId: row.publicationReaderSummaryJobId,
    readerSummaryArtifactId: row.id,
    semanticStatus: "NO_SIGNAL",
    modelVersion: row.modelVersion,
    reportSha256: row.reportSha256,
  };
  if ((row.publicationRequestedUtcDate !== requestedAt.slice(0, 10) &&
        !(row.publicationRequestedUtcDate === date && requestedAt >= end)) ||
      !/^[0-9a-f]{64}$/u.test(row.proofSha256) ||
      canonicalJson(row.exactProof) !== canonicalJson(expectedProof) ||
      canonicalJsonSha256(row.exactProof) !== row.proofSha256) {
    throw new Error(`Daily gap publication exact proof drifted for ${date}`);
  }
}

function assertNoSignalSemantics(row: DailyGapPublicationRow, date: string): void {
  const payload = record(row.artifactPayload);
  const quality = record(row.qualitySignals);
  const decision = record(quality.publicationDecision);
  const lineage = record(payload.lineage);
  const artifact = readerSummaryArtifactFromPrisma(row);
  const audit = quality.githubProjectionAudit as ReaderSummaryGitHubProjectionAudit | undefined;
  if (payload.readerSummaryId !== row.id ||
      payload.tenantId !== row.tenantId || payload.workspaceId !== row.workspaceId ||
      canonicalJson(payload.scope) !== canonicalJson({ type: "workspace" }) ||
      canonicalJson(payload.period) !== canonicalJson(record(row.exactProof).period) ||
      lineage.modelVersion !== row.modelVersion ||
      lineage.promptVersion !== row.promptVersion ||
      payload.headline !== row.headline || payload.executiveSummary !== row.summaryText ||
      canonicalJson(payload.citationMap) !== canonicalJson(row.citations) ||
      canonicalJson(payload.qualityFlags) !== canonicalJson(quality.qualityFlags) ||
      decision.status !== "published" || decision.qualityPassed !== true ||
      !Array.isArray(row.citations) || row.citations.length !== 0 ||
      !readerSummaryIsOrdinaryNoSignalWithoutEvidence(artifact) ||
      !readerSummaryHasVerifiedGitHubProjection({ artifact, audit }) ||
      audit?.status !== "not_required" || audit.bindings.length !== 0) {
    throw new Error(`Daily gap NO_SIGNAL evidence is invalid for ${date}`);
  }
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Daily gap publication evidence must be a JSON object");
  }
  return value as Record<string, unknown>;
}

function timestamp(value: Date | string): string {
  if (!(value instanceof Date) && typeof value !== "string") {
    throw new Error("Daily gap publication timestamp is invalid");
  }
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("Daily gap publication timestamp is invalid");
  }
  return parsed.toISOString();
}
