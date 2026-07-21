import type { Pool } from "pg";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  canonicalJsonSha256,
  dailyPeriodKey,
  readExactReaderSummaryArtifact,
  readLatestReaderSummaryArtifact,
} from "./reader-summary-quality-eval-support";

describe("readLatestReaderSummaryArtifact", () => {
  it("reads only the latest published artifact", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;

    await readLatestReaderSummaryArtifact(
      pool,
      {
        tenantId: tenantId("00000000-0000-7000-8000-000000000001"),
        workspaceId: workspaceId("00000000-0000-7000-8000-000000000002"),
      },
      "2026-07-09",
    );

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("status = 'COMPLETED'");
  });
});

describe("readExactReaderSummaryArtifact", () => {
  const target = {
    artifactId: "00000000-0000-7000-8000-000000000010",
    collectionDate: "2026-07-09",
    tenantId: tenantId("00000000-0000-7000-8000-000000000001"),
    workspaceId: workspaceId("00000000-0000-7000-8000-000000000002"),
    scopeType: "workspace" as const,
    scopeKey: "workspace:00000000-0000-7000-8000-000000000002",
    periodKey: dailyPeriodKey("2026-07-09"),
    modelVersion: "codex:gpt-5.5:xhigh",
    promptVersion: "reader_summary.prompt.agent_runtime.v10",
    rankingPolicyVersion: "story_ranking_v8",
  };

  it("binds the complete reviewed identity without latest ordering", async () => {
    const record = artifactRecord({
      second: [3, { beta: true, alpha: false }],
      first: "value",
    });
    const query = jest.fn().mockResolvedValue({ rows: [record] });
    const pool = { query } as unknown as Pool;

    const result = await readExactReaderSummaryArtifact(pool, target);

    expect(result).toEqual({
      record,
      artifactPayloadSha256: canonicalJsonSha256(record.artifactPayload),
    });
    const [sql, values] = query.mock.calls[0] ?? [];
    expect(sql).toContain("where id = $1::uuid");
    expect(sql).toContain("status = 'COMPLETED'");
    expect(sql).toContain(
      "artifact_payload #>> '{lineage,rankingPolicyVersion}'",
    );
    expect(sql).not.toContain("order by created_at");
    expect(values).toEqual([
      target.artifactId,
      target.tenantId,
      target.workspaceId,
      target.scopeType,
      target.scopeKey,
      target.periodKey,
      "2026-07-09T00:00:00.000Z",
      "2026-07-10T00:00:00.000Z",
      target.modelVersion,
      target.promptVersion,
      target.rankingPolicyVersion,
    ]);
  });

  it("fails closed as missing when exact scope does not match", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;

    await expect(
      readExactReaderSummaryArtifact(pool, {
        ...target,
        scopeKey: "workspace:drifted",
      }),
    ).resolves.toBeNull();
  });
});

describe("canonicalJsonSha256", () => {
  it("is stable across object insertion order while preserving array order", () => {
    const left = { z: [2, 1], a: { second: true, first: "one" } };
    const right = { a: { first: "one", second: true }, z: [2, 1] };
    const reorderedArray = { a: { first: "one", second: true }, z: [1, 2] };

    expect(canonicalJsonSha256(left)).toBe(canonicalJsonSha256(right));
    expect(canonicalJsonSha256(left)).not.toBe(
      canonicalJsonSha256(reorderedArray),
    );
  });
});

function artifactRecord(artifactPayload: unknown) {
  const now = new Date("2026-07-10T00:10:00.000Z");
  return {
    id: "00000000-0000-7000-8000-000000000010",
    tenantId: "00000000-0000-7000-8000-000000000001",
    workspaceId: "00000000-0000-7000-8000-000000000002",
    scopeType: "workspace",
    scopeKey: "workspace:00000000-0000-7000-8000-000000000002",
    interestId: null,
    cadence: "daily",
    periodStartedAt: new Date("2026-07-09T00:00:00.000Z"),
    periodEndedAt: new Date("2026-07-10T00:00:00.000Z"),
    periodTimezone: "UTC",
    periodKey: dailyPeriodKey("2026-07-09"),
    userId: null,
    subscriptionId: null,
    status: "COMPLETED" as const,
    schemaVersion: 1,
    modelVersion: "codex:gpt-5.5:xhigh",
    promptVersion: "reader_summary.prompt.agent_runtime.v10",
    headline: "Fixture",
    summaryText: "Fixture",
    artifactPayload,
    citations: [],
    qualitySignals: {},
    createdAt: now,
    updatedAt: now,
  };
}
