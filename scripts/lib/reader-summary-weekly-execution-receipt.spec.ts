import {
  acquireReaderSummaryWeeklyExecutionReceipt,
  claimReaderSummaryWeeklyExecutionReceiptPair,
  completeReaderSummaryWeeklyExecutionReceipt,
  failReaderSummaryWeeklyExecutionReceiptBeforeDurableOutput,
  reconcileReaderSummaryWeeklyExecutionReceiptPublication,
  readerSummaryWeeklyExecutionReceiptModelLeaseMs,
  readerSummaryWeeklyExecutionReceiptPublicationLeaseMs,
  releaseReaderSummaryWeeklyExecutionReceiptPair,
  terminalizeReaderSummaryWeeklyExecutionReceiptStaleModelFence,
} from "./reader-summary-weekly-execution-receipt";
import {
  resolveReaderSummaryWeeklyProductionWindow,
  type ReaderSummaryWeeklyProductionPostgresClient,
} from "./reader-summary-weekly-production-postgres-contract";

const tenantId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const anchorJobId = "33333333-3333-4333-8333-333333333333";
const scope = Object.freeze({
  tenantId,
  workspaceId,
  scope: Object.freeze({ type: "workspace" as const }),
});
const window = resolveReaderSummaryWeeklyProductionWindow("2026-07-20");
const sealSha256 = "a".repeat(64);
const sealId = `reader_summary.weekly_certification_seal.v1:${sealSha256}`;
const pair = Object.freeze({
  artifactSha256: "b".repeat(64),
  proofSha256: "c".repeat(64),
});

describe("reader summary weekly execution receipt", () => {
  it("locks one certified anchor row before acquiring a seal-bound receipt", async () => {
    const calls: string[] = [];
    const receipt = await acquireReaderSummaryWeeklyExecutionReceipt(
      receiptClient(calls, true),
      receiptParams(),
    );

    expect(receipt.state).toBe("acquired");
    expect(receipt.identity).toMatch(
      /^reader_summary\.weekly_execution_receipt\.v1:[0-9a-f]{64}$/u,
    );
    expect(calls).toHaveLength(3);
    expect(calls[0]).toContain("FOR UPDATE OF job");
    expect(calls[1]).toContain("ON CONFLICT (tenant_id, idempotency_key)");
    expect(calls[2]).toContain("FOR UPDATE OF job");
    expect(calls.join("\n")).not.toMatch(/LOCK\s+TABLE/iu);
  });

  it("keeps running and completed receipts as distinct terminal states", async () => {
    const client = receiptClient([], true);
    const acquired = await acquireReaderSummaryWeeklyExecutionReceipt(
      client,
      receiptParams(),
    );
    const publishing = await claimReaderSummaryWeeklyExecutionReceiptPair(
      client,
      acquired,
      { ...pair, now: new Date("2026-07-27T06:30:00.000Z") },
    );
    const running = await acquireReaderSummaryWeeklyExecutionReceipt(
      client,
      receiptParams(),
    );

    expect(running.state).toBe("running");
    await completeReaderSummaryWeeklyExecutionReceipt(client, publishing);
    await expect(
      acquireReaderSummaryWeeklyExecutionReceipt(client, receiptParams()),
    ).resolves.toMatchObject({ state: "completed", attemptNumber: 1 });
  });

  it("retains the final attempt after a retried durable-pair completion", async () => {
    const client = receiptClient([], true);
    const acquired = await acquireReaderSummaryWeeklyExecutionReceipt(
      client,
      receiptParams(),
    );
    const firstPublisher = await claimReaderSummaryWeeklyExecutionReceiptPair(client, acquired, {
      ...pair,
      now: new Date("2026-07-27T06:30:00.000Z"),
    });
    await releaseReaderSummaryWeeklyExecutionReceiptPair(client, firstPublisher);
    const recovery = await acquireReaderSummaryWeeklyExecutionReceipt(
      client,
      receiptParams(),
    );

    expect(recovery).toMatchObject({ state: "running", attemptNumber: 2 });

    const crashedPublisher = await claimReaderSummaryWeeklyExecutionReceiptPair(
      client,
      recovery,
      { ...pair, now: new Date("2026-07-27T06:31:00.000Z") },
    );
    const afterCrash = await acquireReaderSummaryWeeklyExecutionReceipt(
      client,
      receiptParams(),
    );

    await expect(
      claimReaderSummaryWeeklyExecutionReceiptPair(client, afterCrash, {
        ...pair,
        now: new Date("2026-07-27T06:32:00.000Z"),
      }),
    ).rejects.toThrow("publishing fence is active");
    await expect(
      claimReaderSummaryWeeklyExecutionReceiptPair(client, afterCrash, {
        ...pair,
        proofSha256: "d".repeat(64),
        now: new Date("2026-07-27T06:32:00.000Z"),
      }),
    ).rejects.toThrow("identity/hash mismatch");
    const reclaimed = await claimReaderSummaryWeeklyExecutionReceiptPair(
      client,
      afterCrash,
      {
        ...pair,
        now: new Date(
          new Date("2026-07-27T06:31:00.000Z").getTime() +
            readerSummaryWeeklyExecutionReceiptPublicationLeaseMs,
        ),
      },
    );
    expect(crashedPublisher).toMatchObject({ state: "publishing", attemptNumber: 2 });
    expect(reclaimed).toMatchObject({ state: "publishing", attemptNumber: 2 });
    await completeReaderSummaryWeeklyExecutionReceipt(client, reclaimed);
    await expect(
      acquireReaderSummaryWeeklyExecutionReceipt(client, receiptParams()),
    ).resolves.toMatchObject({ state: "completed", attemptNumber: 2 });
  });

  it("retains the final attempt after a retryable model failure completes", async () => {
    const client = receiptClient([], true);
    const first = await acquireReaderSummaryWeeklyExecutionReceipt(
      client,
      receiptParams(),
    );
    await failReaderSummaryWeeklyExecutionReceiptBeforeDurableOutput(
      client,
      first,
      { category: "infrastructure", retryable: true, code: "runtime_unavailable" },
    );
    const retried = await acquireReaderSummaryWeeklyExecutionReceipt(
      client,
      receiptParams(),
    );
    expect(retried).toMatchObject({ state: "acquired", attemptNumber: 2 });
    const publishing = await claimReaderSummaryWeeklyExecutionReceiptPair(
      client,
      retried,
      { ...pair, now: new Date("2026-07-27T06:30:00.000Z") },
    );
    await completeReaderSummaryWeeklyExecutionReceipt(client, publishing);

    await expect(
      acquireReaderSummaryWeeklyExecutionReceipt(client, receiptParams()),
    ).resolves.toMatchObject({ state: "completed", attemptNumber: 2 });
  });

  it("resumes a restart at the next bounded retryable pre-output model attempt", async () => {
    const client = receiptClient([], true);
    let modelCalls = 0;
    const callModel = (receipt: Awaited<ReturnType<
      typeof acquireReaderSummaryWeeklyExecutionReceipt
    >>) => {
      expect(receipt.state).toBe("acquired");
      modelCalls += 1;
    };
    const first = await acquireReaderSummaryWeeklyExecutionReceipt(
      client,
      receiptParams(1),
    );
    callModel(first);
    await failReaderSummaryWeeklyExecutionReceiptBeforeDurableOutput(
      client,
      first,
      { category: "infrastructure", retryable: true, code: "runtime_unavailable" },
    );

    const second = await acquireReaderSummaryWeeklyExecutionReceipt(
      client,
      receiptParams(1),
    );
    expect(second).toMatchObject({ state: "acquired", attemptNumber: 2 });
    expect(modelCalls).toBe(1);
    callModel(second);
    await failReaderSummaryWeeklyExecutionReceiptBeforeDurableOutput(
      client,
      second,
      { category: "infrastructure", retryable: true, code: "runtime_unavailable" },
    );

    const third = await acquireReaderSummaryWeeklyExecutionReceipt(
      client,
      receiptParams(1),
    );
    expect(third).toMatchObject({ state: "acquired", attemptNumber: 3 });
    expect(modelCalls).toBe(2);
    callModel(third);
    await failReaderSummaryWeeklyExecutionReceiptBeforeDurableOutput(
      client,
      third,
      { category: "infrastructure", retryable: true, code: "runtime_unavailable" },
    );

    await expect(
      acquireReaderSummaryWeeklyExecutionReceipt(client, receiptParams(1)),
    ).resolves.toMatchObject({ state: "failed", attemptNumber: 3 });
    expect(modelCalls).toBe(3);
  });

  it("terminalizes a stale model fence after a crash before the durable pair", async () => {
    const client = receiptClient([], true);
    const first = await acquireReaderSummaryWeeklyExecutionReceipt(
      client,
      receiptParams(),
    );
    const restarted = await acquireReaderSummaryWeeklyExecutionReceipt(
      client,
      receiptParams(1, new Date(
        new Date("2026-07-27T06:30:00.000Z").getTime() +
          readerSummaryWeeklyExecutionReceiptModelLeaseMs,
      )),
    );

    expect(first.state).toBe("acquired");
    expect(restarted).toMatchObject({ state: "running", attemptNumber: 1 });
    await expect(
      terminalizeReaderSummaryWeeklyExecutionReceiptStaleModelFence(
        client,
        restarted,
        new Date("2026-07-27T07:00:00.000Z"),
      ),
    ).resolves.toBe(true);
    await expect(
      acquireReaderSummaryWeeklyExecutionReceipt(
        client,
        receiptParams(),
      ),
    ).resolves.toMatchObject({ state: "failed", attemptNumber: 1 });
  });

  it("retains the final attempt when reconciling a published retry", async () => {
    const client = receiptClient([], true, false, true);
    const acquired = await acquireReaderSummaryWeeklyExecutionReceipt(
      client,
      receiptParams(),
    );
    await failReaderSummaryWeeklyExecutionReceiptBeforeDurableOutput(
      client,
      acquired,
      { category: "infrastructure", retryable: true, code: "runtime_unavailable" },
    );
    const retried = await acquireReaderSummaryWeeklyExecutionReceipt(
      client,
      receiptParams(),
    );
    expect(retried).toMatchObject({ state: "acquired", attemptNumber: 2 });
    await claimReaderSummaryWeeklyExecutionReceiptPair(client, retried, {
      ...pair,
      now: new Date("2026-07-27T06:30:00.000Z"),
    });
    const restarted = await acquireReaderSummaryWeeklyExecutionReceipt(
      client,
      receiptParams(),
    );
    expect(restarted).toMatchObject({ state: "running", attemptNumber: 2 });
    let modelCalls = 0;
    let providerCalls = 0;
    const reconciled = await reconcileReaderSummaryWeeklyExecutionReceiptPublication(
      client,
      restarted,
      { scope, window },
    );
    if (!reconciled) {
      modelCalls += 1;
      providerCalls += 1;
    }

    expect(reconciled).toBe(true);
    expect(modelCalls).toBe(0);
    expect(providerCalls).toBe(0);
    await expect(
      reconcileReaderSummaryWeeklyExecutionReceiptPublication(
        client,
        restarted,
        { scope, window },
      ),
    ).resolves.toBe(true);
    await expect(
      acquireReaderSummaryWeeklyExecutionReceipt(client, receiptParams()),
    ).resolves.toMatchObject({ state: "completed", attemptNumber: 2 });
  });

  it("fails closed when receipt state is ambiguous", async () => {
    await expect(acquireReaderSummaryWeeklyExecutionReceipt(
      receiptClient([], false, true),
      receiptParams(),
    )).rejects.toThrow("ambiguous or diverged");
  });
});

const receiptParams = (
  attemptNumber = 1,
  now = new Date("2026-07-27T06:30:00.000Z"),
) => ({
  scope,
  window,
  sealId,
  sealSha256,
  anchorJobId,
  now,
  attemptNumber,
});

const receiptClient = (
  calls: string[],
  inserted: boolean,
  ambiguous = false,
  publicationExists = false,
): ReaderSummaryWeeklyProductionPostgresClient => {
  let insertValues: readonly unknown[] = [];
  let status = "RUNNING";
  let completedAt: string | null = null;
  let failedAt: string | null = null;
  let failureReason: string | null = null;
  let insertAvailable = inserted;
  let rowInitialized = false;
  return {
    async query<TRow extends Record<string, unknown>>(
      sql: string,
      values: readonly unknown[] = [],
    ) {
      calls.push(sql);
      if (sql.includes("job.cadence = 'daily'")) {
        return { rows: [{ id: anchorJobId } as unknown as TRow] };
      }
      if (sql.includes("INSERT INTO reader_summary_jobs")) {
        insertValues = values;
        if (!rowInitialized) {
          failureReason = values[10] as string;
          rowInitialized = true;
        }
        const created = insertAvailable;
        insertAvailable = false;
        return { rows: created ? [{ id: values[0] } as unknown as TRow] : [] };
      }
      if (sql.includes("job.idempotency_key")) {
        const row = {
          id: insertValues[0],
          tenant_id: tenantId,
          workspace_id: workspaceId,
          scope_type: "workspace",
          scope_key: "workspace",
          interest_id: null,
          cadence: "weekly",
          period_started_at: "2026-07-20T00:00:00.000Z",
          period_ended_at: "2026-07-27T00:00:00.000Z",
          period_timezone: "UTC",
          period_key: insertValues[8],
          status,
          idempotency_key: insertValues[9],
          requested_at: "2026-07-27T06:30:00.000Z",
          started_at: "2026-07-27T06:30:00.000Z",
          completed_at: completedAt,
          failed_at: failedAt,
          reader_summary_artifact_id: null,
          failure_reason: failureReason,
        } as unknown as TRow;
        return { rows: ambiguous ? [row, row] : [row] };
      }
      if (sql.includes("FROM reader_summary_publications")) {
        return { rows: publicationExists ? [{ id: "publication-1" } as unknown as TRow] : [] };
      }
      if (sql.includes("UPDATE reader_summary_jobs")) {
        if (sql.includes("SET status = 'COMPLETED'")) {
          if (status !== "RUNNING") return { rows: [] };
          status = "COMPLETED";
          completedAt = "2026-07-27T06:30:00.000Z";
          failureReason = values[2] as string;
        } else if (sql.includes("SET status = 'FAILED'")) {
          status = "FAILED";
          failedAt = "2026-07-27T06:30:00.000Z";
          failureReason = values[3] as string;
        } else if (sql.includes("SET status = 'RUNNING'")) {
          status = "RUNNING";
          failedAt = null;
          failureReason = values[3] as string;
        } else {
          failureReason = values[3] as string;
        }
        return { rows: [{ id: values[0] } as unknown as TRow] };
      }
      throw new Error("Unexpected receipt query");
    },
  };
};
