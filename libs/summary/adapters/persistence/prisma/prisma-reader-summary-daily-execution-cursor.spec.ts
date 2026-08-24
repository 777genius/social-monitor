import { PrismaReaderSummaryDailyExecutionCursor } from "./prisma-reader-summary-daily-execution-cursor";
import type {
  ReaderSummaryDailySqlClient,
  ReaderSummaryDailySqlResult,
  ReaderSummaryDailySqlTransaction,
} from "./prisma-reader-summary-daily-execution-cursor-row";

const tenantId = "10000000-0000-4000-8000-000000000001";
const workspaceId = "20000000-0000-4000-8000-000000000002";
const claimedRow = {
  outcome: "CLAIMED",
  tenant_id: tenantId,
  workspace_id: workspaceId,
  requested_utc_date: "2026-07-31",
  eligible_through: "2026-07-31",
  ingestion_cutoff: "2026-08-01T00:00:00.000Z",
  source_canonical_bytes: Buffer.from("{}"),
  source_canonical_sha256: "a".repeat(64),
  model_job_state: "RESERVED",
  lease_owner: "worker-1",
  fencing_token: "7",
  leased_at: "2026-08-01T01:00:00.000Z",
  lease_expires_at: "2026-08-01T01:20:00.000Z",
  absolute_expires_at: "2026-08-01T08:00:00.000Z",
  response_bytes: null,
  receipt_bytes: null,
};

describe("PrismaReaderSummaryDailyExecutionCursor", () => {
  it("claims through an explicitly serializable raw SQL transaction", async () => {
    const sql = fakeSql([claimedRow]);
    const repository = new PrismaReaderSummaryDailyExecutionCursor(sql.client);

    const result = await repository.claimNext({
      tenantId,
      workspaceId,
      workerId: "worker-1",
      firstUnresolvedUtcDate: "2026-07-31",
      invokedAt: "2026-08-01T01:00:00.000Z",
    });

    expect(sql.serializableCalls).toBe(1);
    expect(sql.queries[0]?.text).toContain("claim_reader_summary_daily_execution");
    expect(result).toMatchObject({
      kind: "claimed",
      work: { requestedUtcDate: "2026-07-31", modelJobState: "RESERVED" },
    });
  });

  it("uses the bounded claim procedure and maps a post-bound cursor without a claim", async () => {
    const sql = fakeSql([{
      ...claimedRow,
      outcome: "BOUNDED_CAUGHT_UP",
      requested_utc_date: "2026-08-04",
      eligible_through: "2026-08-03",
      ingestion_cutoff: null,
      source_canonical_bytes: null,
      source_canonical_sha256: null,
      model_job_state: null,
      lease_owner: null,
      fencing_token: null,
      leased_at: null,
      lease_expires_at: null,
      absolute_expires_at: null,
    }]);
    const repository = new PrismaReaderSummaryDailyExecutionCursor(sql.client);

    await expect(repository.claimExactBoundedMaintenance({
      tenantId,
      workspaceId,
      workerId: "worker-1",
      requestedUtcDate: "2026-08-03",
      invokedAt: "2026-08-04T01:00:00.000Z",
    })).resolves.toEqual({
      kind: "bounded_caught_up",
      nextUnresolvedUtcDate: "2026-08-04",
    });

    expect(sql.queries[0]?.text).toContain(
      "claim_reader_summary_daily_execution_bounded_maintenance",
    );
    expect(sql.queries[0]?.values).toEqual([
      tenantId,
      workspaceId,
      "worker-1",
      "2026-08-03",
      "2026-08-04T01:00:00.000Z",
    ]);
  });

  it("retries serialization conflicts and never retries ordinary failures", async () => {
    const sql = fakeSql([claimedRow]);
    sql.failures.push(Object.assign(new Error("serialization"), { code: "40001" }));
    const repository = new PrismaReaderSummaryDailyExecutionCursor(sql.client, 3);
    await expect(repository.claimNext(claimInput())).resolves.toMatchObject({ kind: "claimed" });
    expect(sql.serializableCalls).toBe(2);

    const failed = fakeSql([claimedRow]);
    failed.failures.push(new Error("permission denied"));
    await expect(
      new PrismaReaderSummaryDailyExecutionCursor(failed.client).claimNext(claimInput()),
    ).rejects.toThrow("permission denied");
    expect(failed.serializableCalls).toBe(1);
  });

  it("uses fenced SQL transitions for renew, RUNNING, COMPLETED, and finalization", async () => {
    const sql = fakeSql([{
      lease_owner: "worker-1",
      fencing_token: "7",
      leased_at: "2026-08-01T01:00:00.000Z",
      lease_expires_at: "2026-08-01T01:25:00.000Z",
      absolute_expires_at: "2026-08-01T08:00:00.000Z",
    }]);
    const repository = new PrismaReaderSummaryDailyExecutionCursor(sql.client);
    await repository.renewLease({
      tenantId, workspaceId, workerId: "worker-1", requestedUtcDate: "2026-07-31",
      fencingToken: 7n, renewedAt: "2026-08-01T01:05:00.000Z",
    });
    sql.rows = [{}];
    await repository.markRunning({
      tenantId, workspaceId, workerId: "worker-1", requestedUtcDate: "2026-07-31",
      fencingToken: 7n, startedAt: "2026-08-01T01:00:01.000Z",
    });
    await repository.complete({
      tenantId, workspaceId, workerId: "worker-1", requestedUtcDate: "2026-07-31",
      fencingToken: 7n, completedAt: "2026-08-01T01:10:00.000Z",
      responseBytes: Buffer.from("response"), responseSha256: "b".repeat(64),
      attestation: { schemaVersion: 1 }, attestationBytes: Buffer.from("attestation"),
      attestationSha256: "c".repeat(64), receiptBytes: Buffer.from("receipt"),
      receiptSha256: "d".repeat(64),
      modelTelemetry: {
        provider: "codex", model: "gpt-5.6-sol", reasoningEffort: "xhigh",
        inputTokens: 120, outputTokens: 30,
        usageSource: "PROVIDER_REPORTED", durationMs: 25,
      },
    });
    await repository.finalizePublication({
      tenantId, workspaceId, workerId: "worker-1",
      requestedUtcDate: "2026-07-31", fencingToken: 7n,
      finalizedAt: "2026-08-01T01:11:00.000Z",
      publication: {
        readerSummaryJobId: "30000000-0000-4000-8000-000000000003",
        readerSummaryArtifactId: "40000000-0000-4000-8000-000000000004",
        publicationId: "40000000-0000-4000-8000-000000000004",
        reportSha256: "e".repeat(64), proofSha256: "f".repeat(64),
        weeklyEvidenceSha256: "1".repeat(64),
        publicEvidenceBytes: Buffer.from("evidence"),
        publicEvidenceSha256: "2".repeat(64),
        publicFrontendBytes: Buffer.from("frontend"),
        publicFrontendSha256: "3".repeat(64),
      },
    });
    expect(sql.queries.map((query) => query.text)).toEqual(expect.arrayContaining([
      expect.stringContaining("renew_reader_summary_daily_execution_lease"),
      expect.stringContaining("mark_reader_summary_daily_model_job_running"),
      expect.stringContaining("complete_reader_summary_daily_model_job_v2"),
      expect.stringContaining("finalize_reader_summary_daily_publication"),
    ]));
    expect(sql.queries[2]?.values.slice(-4)).toEqual([
      120, 30, "PROVIDER_REPORTED", 25,
    ]);
  });
});

const claimInput = () => ({
  tenantId, workspaceId, workerId: "worker-1",
  firstUnresolvedUtcDate: "2026-07-31", invokedAt: "2026-08-01T01:00:00.000Z",
});

const fakeSql = (initialRows: readonly Record<string, unknown>[]) => {
  const state: {
    rows: readonly Record<string, unknown>[];
    failures: Error[];
    serializableCalls: number;
    queries: { text: string; values: readonly unknown[] }[];
    client: ReaderSummaryDailySqlClient;
  } = {
    rows: initialRows,
    failures: [],
    serializableCalls: 0,
    queries: [],
    client: undefined as unknown as ReaderSummaryDailySqlClient,
  };
  const transaction: ReaderSummaryDailySqlTransaction = {
    query: async <TRow extends Record<string, unknown>>(text: string, values = []) => {
      state.queries.push({ text, values });
      return { rows: state.rows as readonly TRow[], rowCount: state.rows.length } satisfies ReaderSummaryDailySqlResult<TRow>;
    },
  };
  state.client = {
    ...transaction,
    serializable: async <T>(operation: (tx: ReaderSummaryDailySqlTransaction) => Promise<T>) => {
      state.serializableCalls += 1;
      const failure = state.failures.shift();
      if (failure !== undefined) throw failure;
      return operation(transaction);
    },
  };
  return state;
};
