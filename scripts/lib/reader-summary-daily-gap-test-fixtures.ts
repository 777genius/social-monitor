import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { buildReaderSummaryPublicationPayload } from "@social-monitor/summary/adapters/persistence/reader-summary-publication-proof";
import { ReaderSummaryArtifact, ReaderSummaryJob, buildReaderSummaryPeriod } from "@social-monitor/summary/domain";
import type { ReaderSummaryPublicationCommand } from "@social-monitor/summary/ports";

import type { DailyGapPublicationRow } from "./reader-summary-daily-gap-bindings";
import { canonicalJsonSha256 } from "./reader-summary-quality-eval-support";

export const dailyGapTestScope = {
  tenantId: "00000000-0000-4000-8000-000000009201",
  workspaceId: "00000000-0000-4000-8000-000000009202",
};
export const dailyGapTestDatabaseUrl = "postgresql://gap.example.test/synthetic_gap";
export const dailyGapTestDates = [
  "2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03",
];

export function dailyGapTestRows(): DailyGapPublicationRow[] {
  return dailyGapTestDates.map((date, index) => dailyGapTestRow(
    date, index === 4 ? "NO_SIGNAL" : "COMPLETED", index,
  ));
}

export function dailyGapTestRow(
  date: string, status: "COMPLETED" | "NO_SIGNAL", index = 0,
): DailyGapPublicationRow {
  const noSignal = status === "NO_SIGNAL";
  const period = buildReaderSummaryPeriod({
    cadence: "daily", timezone: "UTC",
    startedAt: new Date(`${date}T00:00:00.000Z`),
    endedAt: new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000),
  });
  const id = `00000000-0000-4000-8000-${String(9300 + index).padStart(12, "0")}`;
  const jobId = `00000000-0000-4000-8000-${String(9400 + index).padStart(12, "0")}`;
  const requestedAt = new Date(period.endedAt.getTime() + 1_000);
  const completedAt = new Date(period.endedAt.getTime() + 2_000);
  const scope = {
    tenantId: tenantId(dailyGapTestScope.tenantId),
    workspaceId: workspaceId(dailyGapTestScope.workspaceId),
  };
  const artifact = ReaderSummaryArtifact.create({
    schemaVersion: "reader_summary.artifact.v1", readerSummaryId: id,
    ...scope, scope: { type: "workspace" }, period, generatedAt: completedAt,
    sourceWindow: {
      windowId: `synthetic-window-${date}`, startedAt: period.startedAt,
      endedAt: period.endedAt,
      selectedFeedItemIds: noSignal ? [] : ["synthetic-feed"],
      storyClusterIds: noSignal ? [] : ["synthetic-story"],
    },
    storyClusters: noSignal ? [] : [{
      id: "synthetic-story", storyKey: "synthetic-story", representativeFeedItemId: "synthetic-feed",
      duplicateFeedItemIds: [], interestIds: ["synthetic-interest"], providerKeys: ["hacker-news"],
      score: 1, observedAtRange: { startedAt: period.startedAt, endedAt: period.endedAt },
      whyImportant: ["Synthetic test evidence."],
    }], contextArtifacts: [],
    headline: noSignal ? "No qualifying signal" : "Synthetic daily publication",
    executiveSummary: noSignal ? "No evidence passed selection." : "Synthetic publication text.",
    topStories: noSignal ? [] : [{
      storyClusterId: "synthetic-story", title: "Synthetic story", summary: "Synthetic evidence summary.",
      interestIds: ["synthetic-interest"], providerKeys: ["hacker-news"], citationIds: ["synthetic-citation"],
    }], interestHighlights: [], repeatedSignals: [], risksAndUnknowns: [],
    citationMap: noSignal ? [] : [{
      citationId: "synthetic-citation", feedItemId: "synthetic-feed",
      sourceItemId: "synthetic-source", providerKey: "hacker-news", field: "title",
    }],
    qualityFlags: noSignal ? ["no_signal"] : [],
    confidence: { level: noSignal ? "none" : "high", score: noSignal ? 0 : 0.9, rationale: "Synthetic fixture." },
    lineage: {
      promptVersion: "synthetic-prompt-v1", schemaVersion: "reader_summary.artifact.v1",
      modelVersion: "synthetic-model-v1", providerVersion: "fixture",
      rulesVersion: "synthetic-rules-v1", evalDatasetVersion: "synthetic-eval-v1",
      rankingPolicyVersion: "synthetic-ranking-v1",
    },
    usage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 },
    ...(noSignal ? { noSignalReason: "No eligible provider evidence." } : {}),
  });
  const finalJob = ReaderSummaryJob.rehydrate({
    id: jobId, ...scope, scope: { type: "workspace" }, period,
    status: noSignal ? "no_signal" : "completed", idempotencyKey: `synthetic-${date}`,
    requestedAt, startedAt: requestedAt, completedAt, readerSummaryId: id,
  });
  const command: ReaderSummaryPublicationCommand = {
    artifact, finalJob,
    publicationDecision: {
      status: "published", qualityPassed: true, canonicalScore: 1, reasons: [],
      shadow: { mode: "shadow", policyVersion: "reader_summary_publication_shadow_v1", riskScore: 0, signals: [] },
    },
    githubProjectionAudit: {
      schemaVersion: "reader_summary.github_projection.v1", status: "not_required",
      requestedUtcDay: date, pageCount: noSignal ? 1 : 0, scannedItemCount: 0,
      eligibleBindingIds: [], bindings: [], violationCodes: [], reasons: [],
      ...(noSignal ? {} : { historicalOmission: {
        mode: "github_projection_unavailable_historical" as const,
        reason: "Synthetic fixture omits GitHub.", authorizedAt: requestedAt.toISOString(),
      } }),
    },
    readyEvent: {
      eventId: `synthetic-event-${date}`, eventType: "reader_summary.ready", schemaVersion: 1,
      occurredAt: completedAt, ...scope, correlationId: jobId, causationId: jobId,
      payload: {
        readerSummaryJobId: jobId, readerSummaryId: id, ...scope,
        scope: { type: "workspace" }, period, status: noSignal ? "no_signal" : "completed",
      },
    } as ReaderSummaryPublicationCommand["readyEvent"],
  };
  // Produce real v1 report/proof bindings through the canonical publisher,
  // entirely in memory; no database, provider, or production fixture is used.
  const publication = buildReaderSummaryPublicationPayload(command);
  return {
    collectionDate: date, capturedAt: new Date("2026-09-05T00:00:00.000Z"),
    currentPublicationId: id, publicationId: id, publicationKind: "EXACT",
    semanticStatus: status, publicationArtifactId: id,
    publicationModelVersion: publication.modelVersion,
    reportSha256: publication.reportSha256, proofSha256: publication.proofSha256,
    exactProof: publication.exactProof,
    publicationRequestedUtcDate: publication.requestedUtcDate,
    publicationRequestedAt: requestedAt, publicationReaderSummaryJobId: jobId,
    id, ...dailyGapTestScope, scopeType: "workspace", scopeKey: "workspace",
    interestId: null, cadence: "daily", periodStartedAt: period.startedAt,
    periodEndedAt: period.endedAt, periodTimezone: "UTC", periodKey: period.periodKey,
    userId: null, subscriptionId: null, status, schemaVersion: 1,
    modelVersion: publication.modelVersion, promptVersion: "synthetic-prompt-v1",
    headline: publication.report.headline as string,
    summaryText: publication.report.summaryText as string,
    artifactPayload: publication.report.artifactPayload, citations: publication.report.citations,
    qualitySignals: publication.report.qualitySignals, createdAt: completedAt, updatedAt: completedAt,
  };
}

export function dailyGapTestRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

export function rehashDailyGapTestRow(row: DailyGapPublicationRow): DailyGapPublicationRow {
  const reportSha256 = canonicalJsonSha256({
    schemaVersion: "reader_summary.publication_report.v1", semanticStatus: row.status,
    modelVersion: row.modelVersion, promptVersion: row.promptVersion,
    headline: row.headline, summaryText: row.summaryText, artifactPayload: row.artifactPayload,
    citations: row.citations, qualitySignals: row.qualitySignals,
  });
  const exactProof = { ...dailyGapTestRecord(row.exactProof), reportSha256 };
  return { ...row, reportSha256, exactProof, proofSha256: canonicalJsonSha256(exactProof) };
}
