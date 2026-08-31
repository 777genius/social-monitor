import type { PoolClient } from "pg";
import { buildReaderSummary, ReaderSummaryArtifact } from
  "@social-monitor/summary/domain";
import { tenantId as tenant, workspaceId as workspace } from
  "@social-monitor/shared-kernel";
import { serializeReaderSummaryArtifact } from
  "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-json";

import { verifyHistoricalPromotionArtifact } from
  "./reader-summary-promotion-v2-historical-artifact";
import { preparePromotionRollbackLifecycleFixture } from
  "./reader-summary-promotion-v2-rollback-lifecycle-fixture";

describe("Promotion V2 rollback real-publisher lifecycle fixture", () => {
  it.each([
    ["v1", "strict-v1"],
    ["v2", "valid-v2"],
  ] as const)("builds a domain-readable %s artifact", async (
    version,
    expected,
  ) => {
    const query = jest.fn(async (
      sql: string,
      _values?: readonly unknown[],
    ) => {
      void _values;
      if (sql.includes("SELECT id::text")) return { rows: [artifactRow] };
      if (sql.includes("UPDATE reader_summary_artifacts")) {
        return { rows: [{ id: artifactId }] };
      }
      throw new Error("Unexpected lifecycle fixture query");
    });
    await preparePromotionRollbackLifecycleFixture(
      { query } as unknown as PoolClient,
      { jobId, artifactId, eventId, payload: {} },
      version,
    );
    const values = query.mock.calls[1]?.[1] as readonly unknown[];
    const artifactPayload = JSON.parse(String(values[1]));
    expect(verifyHistoricalPromotionArtifact({
      artifactId,
      status: "COMPLETED",
      tenantId,
      workspaceId,
      scopeType: "workspace",
      interestId: null,
      cadence: "daily",
      periodStartedAt: artifactRow.period_started_at,
      periodEndedAt: artifactRow.period_ended_at,
      periodTimezone: "UTC",
      userId: null,
      subscriptionId: null,
      headline: artifactRow.headline,
      summaryText: artifactRow.summary_text,
      createdAt: artifactRow.created_at,
      artifactPayload,
    }).kind).toBe(expected);
  });

  it("rejects empty, incomplete, duplicate, citationless and mismatched V2 tuples", async () => {
    const valid = await lifecyclePayload("v2");
    expect(verifyHistoricalPromotionArtifact(record(valid)).kind)
      .toBe("valid-v2");
    expect(() => verifyHistoricalPromotionArtifact({
      ...record(valid),
      status: "NO_SIGNAL",
    })).toThrow();

    const empty = clone(valid);
    empty.promotionAttestations = [];
    expect(() => verifyHistoricalPromotionArtifact(record(empty)))
      .toThrow();

    const incomplete = clone(valid);
    (incomplete.promotionAttestations as unknown[]).pop();
    expect(() => verifyHistoricalPromotionArtifact(record(incomplete)))
      .toThrow();

    const duplicate = clone(valid);
    const attestations = duplicate.promotionAttestations as unknown[];
    if (attestations.length < 2) throw new Error("fixture needs two cards");
    attestations[1] = clone(attestations[0]);
    expect(() => verifyHistoricalPromotionArtifact(record(duplicate)))
      .toThrow();

    const citationless = clone(valid);
    citationless.citationMap = [];
    expect(() => verifyHistoricalPromotionArtifact(record(citationless)))
      .toThrow();

    const mismatched = clone(valid);
    const top = (mismatched.content as Record<string, unknown>)
      .topReads as Record<string, unknown>[];
    top[0]!.promotionCandidateId = "00000000-0000-4000-8000-999999999999";
    expect(() => verifyHistoricalPromotionArtifact(record(mismatched)))
      .toThrow();
  });

  it("recognizes an explicit empty NO_SIGNAL tuple without calling it V2", () => {
    const payload = serializeReaderSummaryArtifact(noSignalArtifact());
    expect(verifyHistoricalPromotionArtifact(record(payload))).toMatchObject({
      kind: "valid-no-signal",
      noSignal: true,
      orderedLanes: { top: [], additional: [] },
    });
    expect(() => verifyHistoricalPromotionArtifact({
      ...record(payload),
      status: "COMPLETED",
    })).toThrow("tuple is unknown or tampered");
  });
});

const lifecyclePayload = async (
  version: "v1" | "v2",
): Promise<Record<string, unknown>> => {
  const query = jest.fn(async (
    sql: string,
    _values?: readonly unknown[],
  ) => {
    void _values;
    if (sql.includes("SELECT id::text")) return { rows: [artifactRow] };
    if (sql.includes("UPDATE reader_summary_artifacts")) {
      return { rows: [{ id: artifactId }] };
    }
    throw new Error("Unexpected lifecycle fixture query");
  });
  await preparePromotionRollbackLifecycleFixture(
    { query } as unknown as PoolClient,
    { jobId, artifactId, eventId, payload: {} },
    version,
  );
  const values = query.mock.calls[1]?.[1] as readonly unknown[];
  return JSON.parse(String(values[1])) as
    Record<string, unknown>;
};

const record = (artifactPayload: unknown) => ({
  artifactId,
  status: (artifactPayload as { qualityFlags?: readonly string[] })
    .qualityFlags?.includes("no_signal") ? "NO_SIGNAL" : "COMPLETED",
  tenantId,
  workspaceId,
  scopeType: "workspace",
  interestId: null,
  cadence: "daily",
  periodStartedAt: artifactRow.period_started_at,
  periodEndedAt: artifactRow.period_ended_at,
  periodTimezone: "UTC",
  userId: null,
  subscriptionId: null,
  headline: artifactRow.headline,
  summaryText: artifactRow.summary_text,
  createdAt: artifactRow.created_at,
  artifactPayload,
});

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const noSignalArtifact = (): ReaderSummaryArtifact => {
  const startedAt = new Date(artifactRow.period_started_at);
  const endedAt = new Date(artifactRow.period_ended_at);
  const sourceWindow = {
    windowId: `no-signal:${artifactId}`,
    startedAt,
    endedAt,
    selectedFeedItemIds: [],
    storyClusterIds: [],
    periodStartedAt: startedAt,
    periodEndedAt: endedAt,
    ingestionCutoff: endedAt,
  };
  const reason = "No retained evidence passed Promotion V2 policy.";
  return ReaderSummaryArtifact.create({
    schemaVersion: "reader_summary.artifact.v1",
    readerSummaryId: artifactId,
    tenantId: tenant(tenantId),
    workspaceId: workspace(workspaceId),
    scope: { type: "workspace" },
    period: {
      cadence: "daily",
      startedAt,
      endedAt,
      timezone: "UTC",
      periodKey: artifactRow.period_key,
    },
    generatedAt: new Date(artifactRow.created_at),
    sourceWindow,
    storyClusters: [],
    contextArtifacts: [],
    headline: artifactRow.headline,
    executiveSummary: artifactRow.summary_text,
    content: buildReaderSummary({
      headline: artifactRow.headline,
      executiveSummary: reason,
      topStories: [],
      interestHighlights: [],
      repeatedSignals: [],
      risksAndUnknowns: [],
      citationMap: [],
      storyClusters: [],
      sourceWindow,
      selectedEvidence: [],
      qualityFlags: ["no_signal"],
      noSignalReason: reason,
    }),
    topStories: [],
    interestHighlights: [],
    repeatedSignals: [],
    risksAndUnknowns: [],
    citationMap: [],
    qualityFlags: ["no_signal"],
    confidence: { level: "none", score: 0, rationale: reason },
    lineage: {
      promptVersion: "reader_summary.promotion_no_signal.v1",
      schemaVersion: "reader_summary.artifact.v1",
      modelVersion: "not_invoked",
      providerVersion: "deterministic",
      rulesVersion: "reader_promotion_policy.v2",
      evalDatasetVersion: "reader_promotion_policy.v2",
    },
    usage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 },
    promotionAttestations: [],
    promotionEvidenceFacts: [],
    noSignalReason: reason,
  });
};

const tenantId = "00000000-0000-7000-8000-000000000001";
const workspaceId = "00000000-0000-7000-8000-000000000002";
const artifactId = "00000000-0000-4000-8000-000000000101";
const jobId = "00000000-0000-4000-8000-000000000102";
const eventId = "00000000-0000-4000-8000-000000000103";
const artifactRow = {
  id: artifactId,
  tenant_id: tenantId,
  workspace_id: workspaceId,
  period_started_at: "2026-06-20T00:00:00.000Z",
  period_ended_at: "2026-06-21T00:00:00.000Z",
  period_timezone: "UTC",
  period_key:
    "daily:2026-06-20T00:00:00.000Z:2026-06-21T00:00:00.000Z:UTC",
  model_version: "codex:gpt-5.5:xhigh",
  prompt_version: "reader-summary.prompt.pg-gate.v1",
  headline: "Rollback lifecycle fixture",
  summary_text: "The real publisher lifecycle remains readable.",
  citations: [{
    citationId: "00000000-0000-4000-8000-000000000104",
    feedItemId: "00000000-0000-4000-8000-000000000105",
    sourceItemId: "00000000-0000-4000-8000-000000000106",
    providerKey: "reddit",
    field: "title" as const,
    canonicalUrl: "https://reddit.example.test/rollback",
  }],
  created_at: "2026-06-20T09:00:00.000Z",
};
