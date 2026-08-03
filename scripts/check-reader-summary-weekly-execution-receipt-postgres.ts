import { Pool } from "pg";

import {
  acquireReaderSummaryWeeklyExecutionReceipt,
  claimReaderSummaryWeeklyExecutionReceiptPair,
  failReaderSummaryWeeklyExecutionReceiptBeforeDurableOutput,
  reconcileReaderSummaryWeeklyExecutionReceiptPublication,
  readerSummaryWeeklyExecutionReceiptModelLeaseMs,
  readerSummaryWeeklyExecutionReceiptPublicationLeaseMs,
  releaseReaderSummaryWeeklyExecutionReceiptPair,
  terminalizeReaderSummaryWeeklyExecutionReceiptStaleModelFence,
} from "./lib/reader-summary-weekly-execution-receipt";
import {
  resolveReaderSummaryWeeklyProductionWindow,
  withReaderSummaryWeeklyProductionDatabaseAccess,
} from "./lib/reader-summary-weekly-production-postgres-contract";
import { loadReaderSummaryWeeklyScheduleObservations } from "./lib/reader-summary-weekly-schedule-postgres";

const tenantId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const anchorJobId = "33333333-3333-4333-8333-333333333333";
const retryAnchorJobId = "55555555-5555-4555-8555-555555555555";
const staleAnchorJobId = "66666666-6666-4666-8666-666666666666";
const scope = Object.freeze({
  tenantId,
  workspaceId,
  scope: Object.freeze({ type: "workspace" as const }),
});
const window = resolveReaderSummaryWeeklyProductionWindow("2026-07-20");
const retryWindow = resolveReaderSummaryWeeklyProductionWindow("2026-07-13");
const staleWindow = resolveReaderSummaryWeeklyProductionWindow("2026-07-06");
const sealSha256 = "a".repeat(64);
const sealId = `reader_summary.weekly_certification_seal.v1:${sealSha256}`;
const pair = Object.freeze({
  artifactSha256: "b".repeat(64),
  proofSha256: "c".repeat(64),
});
const receiptNow = new Date("2026-07-27T06:30:00.000Z");

async function main(): Promise<void> {
  const testDatabase = requireTestDatabase();
  const pool = new Pool({
    connectionString: testDatabase.databaseUrl,
    min: 0,
    max: 2,
  });
  try {
    const version = await pool.query<{ server_version_num: string }>(
      "SELECT current_setting('server_version_num') AS server_version_num",
    );
    if (!/^18[0-9]{4}$/u.test(version.rows[0]?.server_version_num ?? "")) {
      throw new Error("Weekly execution receipt gate requires PostgreSQL 18");
    }
    if (testDatabase.schema !== null) {
      await pool.query(`CREATE SCHEMA "${testDatabase.schema}"`);
    }
    await createFixture(pool);

    let releaseFirst = (): void => undefined;
    let firstAcquired = (): void => undefined;
    const firstAcquiredSignal = new Promise<void>((resolve) => {
      firstAcquired = resolve;
    });
    const releaseFirstSignal = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = withReceiptTransaction(pool, async (client) => {
      const receipt = await acquire(client);
      firstAcquired();
      await releaseFirstSignal;
      return receipt;
    });
    await firstAcquiredSignal;
    let secondSettled = false;
    const second = withReceiptTransaction(pool, acquire)
      .finally(() => { secondSettled = true; });
    await delay(150);
    if (secondSettled) {
      throw new Error("Competing receipt claimant bypassed the exact row lock");
    }
    releaseFirst();
    const [firstReceipt, secondReceipt] = await Promise.all([first, second]);
    if (
      firstReceipt.state !== "acquired" ||
      secondReceipt.state !== "running" ||
      firstReceipt.identity !== secondReceipt.identity
    ) {
      throw new Error("Concurrent weekly receipt fencing did not fail closed");
    }

    await assertRetryableRestart(pool);
    await assertStaleModelFenceRecovery(pool);

    const publishing = await withReceiptTransaction(pool, (client) =>
      claimReaderSummaryWeeklyExecutionReceiptPair(client, firstReceipt, {
        ...pair,
        now: new Date("2026-07-27T06:30:00.000Z"),
      }),
    );
    await withReceiptTransaction(pool, (client) =>
      releaseReaderSummaryWeeklyExecutionReceiptPair(client, publishing),
    );
    const recoverable = await withReceiptTransaction(pool, acquire);
    if (recoverable.state !== "running") {
      throw new Error("Failed publication did not leave a recoverable receipt");
    }
    const crashedPublisher = await withReceiptTransaction(pool, (client) =>
      claimReaderSummaryWeeklyExecutionReceiptPair(client, recoverable, {
        ...pair,
        now: new Date("2026-07-27T06:31:00.000Z"),
      }),
    );
    const afterCrash = await withReceiptTransaction(pool, acquire);
    await expectRejected(
      withReceiptTransaction(pool, (client) =>
        claimReaderSummaryWeeklyExecutionReceiptPair(client, afterCrash, {
          ...pair,
          now: new Date("2026-07-27T06:32:00.000Z"),
        }),
      ),
      "publishing fence is active",
    );
    const recoveredPublisher = await withReceiptTransaction(pool, (client) =>
      claimReaderSummaryWeeklyExecutionReceiptPair(client, afterCrash, {
        ...pair,
        now: new Date(
          new Date("2026-07-27T06:31:00.000Z").getTime() +
            readerSummaryWeeklyExecutionReceiptPublicationLeaseMs,
        ),
      }),
    );
    if (crashedPublisher.state !== "publishing" || recoveredPublisher.state !== "publishing") {
      throw new Error("Durable weekly receipt was not reclaimed with publishing fencing");
    }
    await insertWeeklyPublication(pool);
    const reconciliationObservations = await withReceiptTransaction(pool, (client) =>
      loadObservationsInNonUtcSession(client),
    );
    if (reconciliationObservations.length !== 0) {
      throw new Error("Published running receipt was not scheduled for reconciliation");
    }
    const restartAfterPublication = await withReceiptTransaction(pool, acquire);
    let modelCallsAfterPublication = 0;
    let providerCallsAfterPublication = 0;
    const reconciled = await withReceiptTransaction(pool, (client) =>
      reconcileReaderSummaryWeeklyExecutionReceiptPublication(client, restartAfterPublication, {
        scope,
        window,
      }),
    );
    const reconciledAgain = await withReceiptTransaction(pool, (client) =>
      reconcileReaderSummaryWeeklyExecutionReceiptPublication(client, restartAfterPublication, {
        scope,
        window,
      }),
    );
    if (!reconciled) {
      modelCallsAfterPublication += 1;
      providerCallsAfterPublication += 1;
    }
    if (
      !reconciled ||
      !reconciledAgain ||
      modelCallsAfterPublication !== 0 ||
      providerCallsAfterPublication !== 0
    ) {
      throw new Error("Published receipt restart repeated a model or provider call");
    }
    const afterCrashOrCompletion = await withReceiptTransaction(pool, acquire);
    if (
      afterCrashOrCompletion.state !== "completed" ||
      afterCrashOrCompletion.attemptNumber !== 2
    ) {
      throw new Error("Durable weekly receipt was reusable after completion");
    }
    const observations = await withReceiptTransaction(pool, (client) =>
      loadObservationsInNonUtcSession(client),
    );
    if (
      observations.length !== 1 ||
      observations[0]?.state !== "completed"
    ) {
      throw new Error("Completed receipt did not occupy its scheduler slot");
    }

    await insertAmbiguousReceipt(pool);
    await expectRejected(
      withReceiptTransaction(pool, acquire),
      "ambiguous or diverged",
    );
    console.log("Reader summary weekly execution receipt PostgreSQL 18 gate OK");
  } finally {
    if (testDatabase.schema !== null) {
      await pool.query(`DROP SCHEMA "${testDatabase.schema}" CASCADE`)
        .catch(() => undefined);
    }
    await pool.end();
  }
}

const acquire = (client: Parameters<typeof acquireReaderSummaryWeeklyExecutionReceipt>[0]) =>
  acquireReaderSummaryWeeklyExecutionReceipt(client, {
    scope,
    window,
    sealId,
    sealSha256,
    anchorJobId,
    now: receiptNow,
  });

const acquireRetry = (
  client: Parameters<typeof acquireReaderSummaryWeeklyExecutionReceipt>[0],
) => acquireReaderSummaryWeeklyExecutionReceipt(client, {
  scope,
  window: retryWindow,
  sealId,
  sealSha256,
  anchorJobId: retryAnchorJobId,
  now: receiptNow,
  attemptNumber: 1,
});

const acquireStale = (
  client: Parameters<typeof acquireReaderSummaryWeeklyExecutionReceipt>[0],
  now: Date,
) => acquireReaderSummaryWeeklyExecutionReceipt(client, {
  scope,
  window: staleWindow,
  sealId,
  sealSha256,
  anchorJobId: staleAnchorJobId,
  now,
});

const assertRetryableRestart = async (pool: Pool): Promise<void> => {
  let modelCalls = 0;
  const modelAttempt = (receipt: Awaited<ReturnType<typeof acquireRetry>>) => {
    if (receipt.state !== "acquired") {
      throw new Error("Restarted receipt did not fence one model attempt");
    }
    modelCalls += 1;
  };
  const failRetryableModelAttempt = (receipt: Awaited<ReturnType<typeof acquireRetry>>) =>
    withReceiptTransaction(pool, (client) =>
      failReaderSummaryWeeklyExecutionReceiptBeforeDurableOutput(client, receipt, {
        category: "infrastructure",
        retryable: true,
        code: "runtime_unavailable",
      }),
    );

  const first = await withReceiptTransaction(pool, acquireRetry);
  modelAttempt(first);
  await failRetryableModelAttempt(first);
  const retryableObservations = await withReceiptTransaction(pool, (client) =>
    loadObservationsInNonUtcSession(client, retryWindow.weekStartedOn),
  );
  if (retryableObservations.length !== 0) {
    throw new Error("Retryable receipt occupied its restarted scheduler slot");
  }

  const second = await withReceiptTransaction(pool, acquireRetry);
  if (second.attemptNumber !== 2) {
    throw new Error("Restarted receipt did not claim retry attempt two");
  }
  modelAttempt(second);
  await failRetryableModelAttempt(second);
  const third = await withReceiptTransaction(pool, acquireRetry);
  if (third.attemptNumber !== 3) {
    throw new Error("Restarted receipt did not claim retry attempt three");
  }
  modelAttempt(third);
  await failRetryableModelAttempt(third);

  const terminal = await withReceiptTransaction(pool, acquireRetry);
  if (
    terminal.state !== "failed" ||
    terminal.attemptNumber !== 3 ||
    modelCalls !== 3
  ) {
    throw new Error("Retryable receipt exceeded its model attempt fence");
  }
  const terminalObservations = await withReceiptTransaction(pool, (client) =>
    loadObservationsInNonUtcSession(client, retryWindow.weekStartedOn),
  );
  if (
    terminalObservations.length !== 1 ||
    terminalObservations[0]?.state !== "terminal"
  ) {
    throw new Error("Terminal retry receipt did not occupy its scheduler slot");
  }
};

const assertStaleModelFenceRecovery = async (pool: Pool): Promise<void> => {
  const first = await withReceiptTransaction(pool, (client) =>
    acquireStale(client, receiptNow),
  );
  const recoveryNow = new Date(
    receiptNow.getTime() + readerSummaryWeeklyExecutionReceiptModelLeaseMs,
  );
  const restarted = await withReceiptTransaction(pool, (client) =>
    acquireStale(client, recoveryNow),
  );
  const terminalized = await withReceiptTransaction(pool, (client) =>
    terminalizeReaderSummaryWeeklyExecutionReceiptStaleModelFence(
      client,
      restarted,
      recoveryNow,
    ),
  );
  const terminal = await withReceiptTransaction(pool, (client) =>
    acquireStale(client, recoveryNow),
  );
  if (
    first.state !== "acquired" ||
    restarted.state !== "running" ||
    !terminalized ||
    terminal.state !== "failed" ||
    terminal.attemptNumber !== 1
  ) {
    throw new Error("Stale model fence was not terminalized without a model retry");
  }
};

const loadObservationsInNonUtcSession = async (
  client: Parameters<typeof loadReaderSummaryWeeklyScheduleObservations>[0],
  firstWeekStartedOn = "2026-07-20",
) => {
  await client.query("SET LOCAL TIME ZONE 'America/Los_Angeles'");
  return loadReaderSummaryWeeklyScheduleObservations(
    client,
    scope,
    firstWeekStartedOn,
    new Date("2026-07-27T06:30:00.000Z"),
  );
};

const withReceiptTransaction = <T>(
  pool: Pool,
  operation: Parameters<typeof withReaderSummaryWeeklyProductionDatabaseAccess<T>>[2],
): Promise<T> => withReaderSummaryWeeklyProductionDatabaseAccess(
  pool,
  { kind: "tenant", tenantId, workspaceId },
  operation,
);

const createFixture = async (pool: Pool): Promise<void> => {
  await pool.query(`
    CREATE TABLE reader_summary_jobs (
      id uuid PRIMARY KEY,
      tenant_id uuid NOT NULL,
      workspace_id uuid NOT NULL,
      scope_type text NOT NULL,
      scope_key text NOT NULL,
      interest_id uuid,
      cadence text NOT NULL,
      period_started_at timestamptz NOT NULL,
      period_ended_at timestamptz NOT NULL,
      period_timezone text NOT NULL,
      period_key text NOT NULL,
      user_id text,
      subscription_id uuid,
      status text NOT NULL,
      idempotency_key text NOT NULL,
      requested_at timestamptz NOT NULL,
      started_at timestamptz,
      completed_at timestamptz,
      failed_at timestamptz,
      reader_summary_artifact_id uuid,
      failure_reason text,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      UNIQUE (tenant_id, idempotency_key)
    );
    CREATE INDEX reader_summary_jobs_period_lookup_idx
      ON reader_summary_jobs (
        tenant_id, workspace_id, scope_key, cadence, period_started_at
      );
    CREATE TABLE reader_summary_publications (
      id uuid PRIMARY KEY,
      tenant_id uuid NOT NULL,
      workspace_id uuid NOT NULL,
      scope_type text NOT NULL,
      scope_key text NOT NULL,
      cadence text NOT NULL,
      period_started_at timestamptz NOT NULL,
      period_ended_at timestamptz NOT NULL,
      publication_kind text NOT NULL
    );
  `);
  await pool.query(
    `INSERT INTO reader_summary_jobs (
      id, tenant_id, workspace_id, scope_type, scope_key, cadence,
      period_started_at, period_ended_at, period_timezone, period_key,
      status, idempotency_key, requested_at, started_at, created_at, updated_at
    ) VALUES (
      $1::uuid, $2::uuid, $3::uuid, 'workspace', 'workspace', 'daily',
      '2026-07-20T00:00:00.000Z', '2026-07-21T00:00:00.000Z', 'UTC',
      'daily-anchor', 'COMPLETED', 'daily-anchor',
      '2026-07-20T01:00:00.000Z', '2026-07-20T01:00:00.000Z',
      '2026-07-20T01:00:00.000Z', '2026-07-20T01:00:00.000Z'
    )`,
    [anchorJobId, tenantId, workspaceId],
  );
  await pool.query(
    `INSERT INTO reader_summary_jobs (
      id, tenant_id, workspace_id, scope_type, scope_key, cadence,
      period_started_at, period_ended_at, period_timezone, period_key,
      status, idempotency_key, requested_at, started_at, created_at, updated_at
    ) VALUES (
      $1::uuid, $2::uuid, $3::uuid, 'workspace', 'workspace', 'daily',
      '2026-07-13T00:00:00.000Z', '2026-07-14T00:00:00.000Z', 'UTC',
      'daily-retry-anchor', 'COMPLETED', 'daily-retry-anchor',
      '2026-07-13T01:00:00.000Z', '2026-07-13T01:00:00.000Z',
      '2026-07-13T01:00:00.000Z', '2026-07-13T01:00:00.000Z'
    )`,
    [retryAnchorJobId, tenantId, workspaceId],
  );
  await pool.query(
    `INSERT INTO reader_summary_jobs (
      id, tenant_id, workspace_id, scope_type, scope_key, cadence,
      period_started_at, period_ended_at, period_timezone, period_key,
      status, idempotency_key, requested_at, started_at, created_at, updated_at
    ) VALUES (
      $1::uuid, $2::uuid, $3::uuid, 'workspace', 'workspace', 'daily',
      '2026-07-06T00:00:00.000Z', '2026-07-07T00:00:00.000Z', 'UTC',
      'daily-stale-anchor', 'COMPLETED', 'daily-stale-anchor',
      '2026-07-06T01:00:00.000Z', '2026-07-06T01:00:00.000Z',
      '2026-07-06T01:00:00.000Z', '2026-07-06T01:00:00.000Z'
    )`,
    [staleAnchorJobId, tenantId, workspaceId],
  );
};

const insertWeeklyPublication = (pool: Pool): Promise<unknown> => pool.query(
  `INSERT INTO reader_summary_publications (
    id, tenant_id, workspace_id, scope_type, scope_key, cadence,
    period_started_at, period_ended_at, publication_kind
  ) VALUES (
    '77777777-7777-4777-8777-777777777777', $1::uuid, $2::uuid,
    'workspace', 'workspace', 'weekly',
    '2026-07-20T00:00:00.000Z', '2026-07-27T00:00:00.000Z',
    'WEEKLY_CERTIFIED'
  )`,
  [tenantId, workspaceId],
);

const insertAmbiguousReceipt = (pool: Pool): Promise<unknown> => pool.query(
  `INSERT INTO reader_summary_jobs (
    id, tenant_id, workspace_id, scope_type, scope_key, cadence,
    period_started_at, period_ended_at, period_timezone, period_key,
    status, idempotency_key, requested_at, started_at, created_at, updated_at
  ) VALUES (
    '44444444-4444-4444-8444-444444444444', $1::uuid, $2::uuid,
    'workspace', 'workspace', 'weekly',
    '2026-07-20T00:00:00.000Z', '2026-07-27T00:00:00.000Z', 'UTC',
    'diverged', 'RUNNING',
    'reader_summary.weekly_execution_receipt.v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    transaction_timestamp(), transaction_timestamp(),
    transaction_timestamp(), transaction_timestamp()
  )`,
  [tenantId, workspaceId],
);

const expectRejected = async (
  operation: Promise<unknown>,
  expected: string,
): Promise<void> => {
  try {
    await operation;
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes(expected)) return;
    throw error;
  }
  throw new Error("Ambiguous weekly receipt was accepted");
};

const requireTestDatabase = (): Readonly<{
  databaseUrl: string;
  schema: string | null;
}> => {
  const value = process.env.DATABASE_URL;
  if (value === undefined) throw new Error("DATABASE_URL is required");
  const parsed = new URL(value);
  const requestedSchema =
    process.env.READER_SUMMARY_WEEKLY_RECEIPT_TEST_SCHEMA?.trim() ?? "";
  const dedicatedDatabase =
    parsed.pathname === "/social_monitor_weekly_receipt_test";
  if (
    !dedicatedDatabase &&
    !/^weekly_execution_receipt_test_[a-z0-9_]{1,32}$/u.test(requestedSchema)
  ) {
    throw new Error("Weekly receipt gate refuses a non-test database");
  }
  const schema = dedicatedDatabase ? null : requestedSchema;
  if (schema !== null) {
    const existingOptions = parsed.searchParams.get("options");
    const searchPath = `-csearch_path=${schema},public`;
    parsed.searchParams.set(
      "options",
      existingOptions === null ? searchPath : `${existingOptions} ${searchPath}`,
    );
  }
  return Object.freeze({ databaseUrl: parsed.toString(), schema });
};

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
