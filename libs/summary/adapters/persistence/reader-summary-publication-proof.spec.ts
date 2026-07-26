import {
  causationId,
  correlationId,
  eventId,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";

import {
  buildReaderSummaryPeriod,
  ReaderSummaryArtifact,
  ReaderSummaryJob,
  type ReaderSummaryPeriod,
} from "../../domain";
import type { ReaderSummaryPublicationCommand } from "../../ports";
import { buildReaderSummaryPublicationRequestV2 } from "./reader-summary-weekly-publication-evidence";

describe("reader summary publication DB request", () => {
  it("sends only DB locators even when caller-owned presentation text differs", () => {
    const command = publicationCommand(dailyPeriod());

    expect(buildReaderSummaryPublicationRequestV2(command)).toEqual({
      schemaVersion: "reader_summary.publication_command.v2",
      tenantId: "00000000-0000-4000-8000-000000000001",
      workspaceId: "00000000-0000-4000-8000-000000000002",
      readerSummaryJobId: "10000000-0000-4000-8000-000000000001",
      readerSummaryArtifactId: "20000000-0000-4000-8000-000000000001",
    });
    expect(
      JSON.stringify(buildReaderSummaryPublicationRequestV2(command)),
    ).not.toContain("Caller title must never become DB authority");
    expect(
      JSON.stringify(buildReaderSummaryPublicationRequestV2(command)),
    ).not.toContain("Caller text must never become DB authority");
  });

  it("reserves V2 for one exact UTC calendar day", () => {
    const weekly = buildReaderSummaryPeriod({
      cadence: "weekly",
      startedAt: new Date("2026-07-05T00:00:00.000Z"),
      endedAt: new Date("2026-07-12T00:00:00.000Z"),
      timezone: "UTC",
    });

    expect(() =>
      buildReaderSummaryPublicationRequestV2(publicationCommand(weekly)),
    ).toThrow("requires one exact UTC day");
  });
});

const publicationCommand = (
  period: ReaderSummaryPeriod,
): ReaderSummaryPublicationCommand => {
  const tenant = tenantId("00000000-0000-4000-8000-000000000001");
  const workspace = workspaceId("00000000-0000-4000-8000-000000000002");
  const artifactId = "20000000-0000-4000-8000-000000000001";
  const completedAt = new Date("2026-07-06T01:00:00.000Z");
  const artifact = ReaderSummaryArtifact.create({
    schemaVersion: "reader_summary.artifact.v1",
    readerSummaryId: artifactId,
    tenantId: tenant,
    workspaceId: workspace,
    scope: { type: "workspace" },
    period,
    generatedAt: new Date("2026-07-05T10:30:00.000Z"),
    sourceWindow: {
      windowId: "publication-request-window",
      startedAt: period.startedAt,
      endedAt: period.endedAt,
      selectedFeedItemIds: [],
      storyClusterIds: [],
    },
    storyClusters: [],
    contextArtifacts: [],
    headline: "Caller title must never become DB authority",
    executiveSummary: "Caller text must never become DB authority",
    topStories: [],
    interestHighlights: [],
    repeatedSignals: [],
    risksAndUnknowns: [],
    citationMap: [],
    qualityFlags: ["no_signal"],
    confidence: {
      level: "none",
      score: 0,
      rationale: "No provider evidence passed the quality threshold.",
    },
    lineage: {
      promptVersion: "reader-summary.prompt.publication-request.v1",
      schemaVersion: "reader_summary.artifact.v1",
      modelVersion: "codex:gpt-5.5:xhigh",
      providerVersion: "fixture",
      rulesVersion: "reader-summary.rules.v1",
      evalDatasetVersion: "reader-summary.eval.v1",
    },
    usage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 },
    noSignalReason: "No eligible provider evidence.",
  });
  const job = ReaderSummaryJob.rehydrate({
    id: "10000000-0000-4000-8000-000000000001",
    tenantId: tenant,
    workspaceId: workspace,
    scope: { type: "workspace" },
    period,
    status: "no_signal",
    idempotencyKey: "publication-request",
    requestedAt: new Date("2026-07-05T10:00:00.000Z"),
    startedAt: new Date("2026-07-05T10:00:00.000Z"),
    completedAt,
    readerSummaryId: artifactId,
  });

  return {
    artifact,
    finalJob: job,
    publicationDecision: {
      status: "published",
      qualityPassed: true,
      canonicalScore: 1,
      shadow: {
        mode: "shadow",
        policyVersion: "reader_summary_publication_shadow_v1",
        riskScore: 0,
        signals: [],
      },
      reasons: [],
    },
    githubProjectionAudit: {
      schemaVersion: "reader_summary.github_projection.v1",
      status: "not_required",
      requestedUtcDay: period.startedAt.toISOString().slice(0, 10),
      pageCount: 1,
      scannedItemCount: 0,
      eligibleBindingIds: [],
      bindings: [],
      violationCodes: [],
      reasons: [],
    },
    readyEvent: {
      eventId: eventId("30000000-0000-4000-8000-000000000001"),
      eventType: "reader_summary.ready",
      schemaVersion: 1,
      occurredAt: completedAt,
      tenantId: tenant,
      workspaceId: workspace,
      correlationId: correlationId(
        "10000000-0000-4000-8000-000000000001",
      ),
      causationId: causationId(
        "10000000-0000-4000-8000-000000000001",
      ),
      payload: {
        readerSummaryJobId: job.toSnapshot().id,
        readerSummaryId: artifactId,
        tenantId: tenant,
        workspaceId: workspace,
        scope: { type: "workspace" },
        period,
        status: "no_signal",
      },
    },
  };
};

const dailyPeriod = (): ReaderSummaryPeriod =>
  buildReaderSummaryPeriod({
    cadence: "daily",
    startedAt: new Date("2026-07-05T00:00:00.000Z"),
    endedAt: new Date("2026-07-06T00:00:00.000Z"),
    timezone: "UTC",
  });
