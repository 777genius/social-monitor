import {
  ReaderSummaryWeeklyScheduledExecutionError,
} from "./reader-summary-weekly-production-scheduler";
import {
  acquireReaderSummaryWeeklyExecutionReceipt,
  claimReaderSummaryWeeklyExecutionReceiptPair,
  failReaderSummaryWeeklyExecutionReceiptAfterDurableOutput,
  reconcileReaderSummaryWeeklyExecutionReceiptPublication,
} from "./reader-summary-weekly-execution-receipt";
import type {
  ReaderSummaryWeeklyProductionPostgresClient,
} from "./reader-summary-weekly-production-postgres-contract";
import {
  runReaderSummaryWeeklySlotPipeline,
} from "./reader-summary-weekly-slot-pipeline";

const window = Object.freeze({
  weekStartedOn: "2026-07-20",
  weekEndedOn: "2026-07-26",
  dates: Object.freeze([
    "2026-07-20",
    "2026-07-21",
    "2026-07-22",
    "2026-07-23",
    "2026-07-24",
    "2026-07-25",
    "2026-07-26",
  ]),
});
const completed = Object.freeze({ status: "completed" as const });
const terminal = Object.freeze({
  status: "terminal" as const,
  failure: Object.freeze({
    category: "schema" as const,
    retryable: false,
    code: "invalid_slot",
    cause: "fixture",
  }),
});
const receiptScope = Object.freeze({
  tenantId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  scope: Object.freeze({ type: "workspace" as const }),
});
const receiptAnchorJobId = "33333333-3333-4333-8333-333333333333";
const receiptSealSha256 = "a".repeat(64);
const receiptSealId =
  `reader_summary.weekly_certification_seal.v1:${receiptSealSha256}`;
const receiptPair = Object.freeze({
  artifactSha256: "b".repeat(64),
  proofSha256: "c".repeat(64),
});

describe("reader summary weekly slot pipeline", () => {
  it("orders normal slots as exact backfill, admission, synthesis, replay, then completion", async () => {
    const events: string[] = [];
    const observedWeeks: string[] = [];

    const outcome = await runReaderSummaryWeeklySlotPipeline({
      mode: "normal",
      window,
      backfillDailyCertifications: async (receivedWindow) => {
        events.push("backfill");
        observedWeeks.push(receivedWindow.weekStartedOn);
      },
      loadDbState: async (receivedWindow) => {
        events.push("db-state");
        observedWeeks.push(receivedWindow.weekStartedOn);
        return Object.freeze({ state: "complete" });
      },
      admitReviewManifest: async (request) => {
        events.push(`admit:${request.mode}`);
        observedWeeks.push(request.window.weekStartedOn);
        return Object.freeze({ status: "admitted" as const, reviewManifest: "manifest" });
      },
      synthesizeAndPublish: async (request) => {
        events.push("synthesize-publish");
        observedWeeks.push(request.window.weekStartedOn);
        return completed;
      },
      replayZeroModel: async (request) => {
        events.push(`replay:${request.zeroModel}:${request.zeroWrite}`);
        observedWeeks.push(request.window.weekStartedOn);
        return completed;
      },
      complete: async (request) => {
        events.push("complete");
        observedWeeks.push(request.window.weekStartedOn);
        return completed;
      },
    });

    expect(outcome).toEqual(completed);
    expect(events).toEqual([
      "backfill",
      "db-state",
      "admit:normal",
      "synthesize-publish",
      "replay:true:true",
      "complete",
    ]);
    expect(observedWeeks).toEqual([
      window.weekStartedOn,
      window.weekStartedOn,
      window.weekStartedOn,
      window.weekStartedOn,
      window.weekStartedOn,
      window.weekStartedOn,
    ]);
  });

  it("never replays or completes after a non-complete synthesis", async () => {
    const events: string[] = [];

    const outcome = await runReaderSummaryWeeklySlotPipeline({
      mode: "normal",
      window,
      backfillDailyCertifications: async () => { events.push("backfill"); },
      loadDbState: async () => ({ state: "complete" }),
      admitReviewManifest: async () => ({
        status: "admitted" as const,
        reviewManifest: "manifest",
      }),
      synthesizeAndPublish: async () => {
        events.push("synthesize-publish");
        return terminal;
      },
      replayZeroModel: async () => {
        events.push("replay");
        return completed;
      },
      complete: async () => {
        events.push("complete");
        return completed;
      },
    });

    expect(outcome).toEqual(terminal);
    expect(events).toEqual(["backfill", "synthesize-publish"]);
  });

  it("does not complete when exact same-slot replay is non-complete", async () => {
    const events: string[] = [];

    const outcome = await runReaderSummaryWeeklySlotPipeline({
      mode: "normal",
      window,
      backfillDailyCertifications: async () => undefined,
      loadDbState: async () => ({ state: "complete" }),
      admitReviewManifest: async () => ({
        status: "admitted" as const,
        reviewManifest: "manifest",
      }),
      synthesizeAndPublish: async () => {
        events.push("synthesize-publish");
        return completed;
      },
      replayZeroModel: async () => {
        events.push("replay");
        return terminal;
      },
      complete: async () => {
        events.push("complete");
        return completed;
      },
    });

    expect(outcome).toEqual(terminal);
    expect(events).toEqual(["synthesize-publish", "replay"]);
  });

  it("persists a recovered published receipt as failed, never completed, when replay fails", async () => {
    const database = receiptIntegrationDatabase(true);
    const publishing = await acquirePublishingReceipt(database.client);
    const complete = jest.fn(async () => completed);

    const outcome = await runReaderSummaryWeeklySlotPipeline({
      mode: "normal",
      window,
      backfillDailyCertifications: async () => undefined,
      loadDbState: async () => ({ state: "complete" }),
      admitReviewManifest: async () => ({
        status: "admitted" as const,
        reviewManifest: "manifest",
      }),
      synthesizeAndPublish: async () => completed,
      replayZeroModel: async (request) => {
        expect(request).toMatchObject({ zeroModel: true, zeroWrite: true });
        expect(database.status()).toBe("RUNNING");
        return terminal;
      },
      persistReplayFailure: async (_request, outcome) => {
        if (outcome.status !== "terminal") {
          throw new Error("expected terminal replay outcome");
        }
        await failReaderSummaryWeeklyExecutionReceiptAfterDurableOutput(
          database.client,
          publishing,
          outcome.failure ?? terminal.failure,
        );
      },
      complete,
    });

    expect(outcome).toEqual(terminal);
    expect(complete).not.toHaveBeenCalled();
    expect(database.status()).toBe("FAILED");
    expect(database.completedWrites()).toBe(0);
  });

  it("reconciles a recovered publication only after same-slot zero-model replay", async () => {
    const database = receiptIntegrationDatabase(true);
    await acquirePublishingReceipt(database.client);
    const recovery = await acquireReaderSummaryWeeklyExecutionReceipt(
      database.client,
      receiptParams(),
    );
    const events: string[] = [];

    const outcome = await runReaderSummaryWeeklySlotPipeline({
      mode: "normal",
      window,
      backfillDailyCertifications: async () => undefined,
      loadDbState: async () => ({ state: "complete" }),
      admitReviewManifest: async () => ({
        status: "admitted" as const,
        reviewManifest: "manifest",
      }),
      synthesizeAndPublish: async () => {
        events.push("synthesize-publish");
        expect(database.status()).toBe("RUNNING");
        return completed;
      },
      replayZeroModel: async (request) => {
        events.push(`replay:${request.zeroModel}:${request.zeroWrite}`);
        expect(database.status()).toBe("RUNNING");
        return completed;
      },
      complete: async () => {
        events.push("reconcile-complete");
        expect(database.status()).toBe("RUNNING");
        await expect(reconcileReaderSummaryWeeklyExecutionReceiptPublication(
          database.client,
          recovery,
          { scope: receiptScope, window },
        )).resolves.toBe(true);
        return completed;
      },
    });

    expect(outcome).toEqual(completed);
    expect(events).toEqual([
      "synthesize-publish",
      "replay:true:true",
      "reconcile-complete",
    ]);
    expect(database.status()).toBe("COMPLETED");
    expect(database.completedWrites()).toBe(1);
    await expect(reconcileReaderSummaryWeeklyExecutionReceiptPublication(
      database.client,
      recovery,
      { scope: receiptScope, window },
    )).resolves.toBe(true);
    expect(database.completedWrites()).toBe(1);
  });

  it("retries the whole idempotent chain and reuses durable state", async () => {
    const events: string[] = [];
    let manifestPersisted = false;
    let publicationPersisted = false;
    const retryable = new ReaderSummaryWeeklyScheduledExecutionError(
      "temporary transport failure",
      {
        category: "infrastructure",
        retryable: true,
        code: "ECONNRESET",
        cause: "transport",
      },
    );
    const runAttempt = async (attempt: number) =>
      runReaderSummaryWeeklySlotPipeline({
        mode: "normal" as const,
        window,
        backfillDailyCertifications: async () => { events.push(`backfill:${attempt}`); },
        loadDbState: async () => ({ state: "complete" }),
        admitReviewManifest: async () => {
          events.push(manifestPersisted ? "manifest:reuse" : "manifest:persist");
          manifestPersisted = true;
          return { status: "admitted" as const, reviewManifest: "manifest" };
        },
        synthesizeAndPublish: async () => {
          events.push(publicationPersisted ? "publication:reuse" : "publication:persist");
          publicationPersisted = true;
          if (attempt === 1) throw retryable;
          return completed;
        },
        replayZeroModel: async () => {
          events.push("replay");
          return completed;
        },
        complete: async () => {
          events.push("complete");
          return completed;
        },
      });

    await expect(runAttempt(1)).rejects.toBe(retryable);
    await expect(runAttempt(2)).resolves.toEqual(completed);
    expect(events).toEqual([
      "backfill:1",
      "manifest:persist",
      "publication:persist",
      "backfill:2",
      "manifest:reuse",
      "publication:reuse",
      "replay",
      "complete",
    ]);
  });

  it("keeps standalone replay read-only and does not backfill or complete", async () => {
    const events: string[] = [];
    const modelCalls = 0;
    const writeCalls = 0;

    const outcome = await runReaderSummaryWeeklySlotPipeline({
      mode: "replay",
      window,
      loadDbState: async () => {
        events.push("db-state");
        return Object.freeze({ state: "complete" });
      },
      admitReviewManifest: async (request) => {
        events.push(`admit:${request.mode}`);
        return Object.freeze({ status: "admitted" as const, reviewManifest: "manifest" });
      },
      replayZeroModel: async (request) => {
        events.push(`replay:${request.zeroModel}:${request.zeroWrite}`);
        expect(modelCalls).toBe(0);
        expect(writeCalls).toBe(0);
        return completed;
      },
    });

    expect(outcome).toEqual(completed);
    expect(modelCalls).toBe(0);
    expect(writeCalls).toBe(0);
    expect(events).toEqual([
      "db-state",
      "admit:replay",
      "replay:true:true",
    ]);
  });
});

const receiptParams = () => Object.freeze({
  scope: receiptScope,
  window,
  sealId: receiptSealId,
  sealSha256: receiptSealSha256,
  anchorJobId: receiptAnchorJobId,
  now: new Date("2026-07-27T06:30:00.000Z"),
});

const acquirePublishingReceipt = async (
  client: ReaderSummaryWeeklyProductionPostgresClient,
) => {
  const acquired = await acquireReaderSummaryWeeklyExecutionReceipt(
    client,
    receiptParams(),
  );
  return claimReaderSummaryWeeklyExecutionReceiptPair(client, acquired, {
    ...receiptPair,
    now: new Date("2026-07-27T06:30:00.000Z"),
  });
};

const receiptIntegrationDatabase = (publicationExists: boolean) => {
  let insertValues: readonly unknown[] = [];
  let status = "RUNNING";
  let completedAt: string | null = null;
  let failedAt: string | null = null;
  let failureReason: string | null = null;
  let insertAvailable = true;
  let rowInitialized = false;
  let completedWrites = 0;
  const client: ReaderSummaryWeeklyProductionPostgresClient = {
    async query<TRow extends Record<string, unknown>>(
      sql: string,
      values: readonly unknown[] = [],
    ) {
      if (sql.includes("job.cadence = 'daily'")) {
        return { rows: [{ id: receiptAnchorJobId } as unknown as TRow] };
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
      if (sql.includes("FROM reader_summary_publications")) {
        return { rows: publicationExists ? [{ id: "publication-1" } as unknown as TRow] : [] };
      }
      if (sql.includes("job.idempotency_key")) {
        return {
          rows: [{
            id: insertValues[0],
            tenant_id: receiptScope.tenantId,
            workspace_id: receiptScope.workspaceId,
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
          } as unknown as TRow],
        };
      }
      if (sql.includes("UPDATE reader_summary_jobs")) {
        if (sql.includes("SET status = 'COMPLETED'")) {
          if (status !== "RUNNING") return { rows: [] };
          status = "COMPLETED";
          completedAt = "2026-07-27T06:30:00.000Z";
          failureReason = values[2] as string;
          completedWrites += 1;
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
      throw new Error("Unexpected receipt integration query");
    },
  };
  return Object.freeze({
    client,
    status: () => status,
    completedWrites: () => completedWrites,
  });
};
