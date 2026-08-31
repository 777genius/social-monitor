import type { PoolClient } from "pg";

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
});

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
