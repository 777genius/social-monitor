import { randomUUID } from "node:crypto";

import {
  canonicalizeReaderSummaryWeeklyJson,
  readerSummaryWeeklyScopeKey,
} from "../../libs/summary/domain/value-objects/reader-summary-weekly-canonical-json";
import type { ReaderSummaryWeeklyFailureCategory } from "../../libs/summary/domain/policies/reader-summary-weekly-schedule-policy";

import type {
  ReaderSummaryWeeklyProductionPostgresClient,
  ReaderSummaryWeeklyProductionScope,
  ReaderSummaryWeeklyProductionWindow,
} from "./reader-summary-weekly-production-postgres-contract";

export const readerSummaryWeeklyExecutionReceiptSchemaVersion =
  "reader_summary.weekly_execution_receipt.v1" as const;

export const readerSummaryWeeklyExecutionReceiptPublicationLeaseMs =
  10 * 60 * 1_000;
export const readerSummaryWeeklyExecutionReceiptModelLeaseMs =
  30 * 60 * 1_000;
const receiptFenceSchemaVersion =
  "reader_summary.weekly_execution_receipt_fence.v1" as const;
const receiptFencePrefix = `${receiptFenceSchemaVersion}:`;
const maxReceiptAttempts = 3;
export type ReaderSummaryWeeklyExecutionReceiptState =
  | "acquired"
  | "running"
  | "publishing"
  | "completed"
  | "failed";
export type ReaderSummaryWeeklyExecutionReceipt = Readonly<{
  id: string;
  identity: string;
  sha256: string;
  state: ReaderSummaryWeeklyExecutionReceiptState;
  attemptNumber: number;
  fence: string | null;
}>;
export type ReaderSummaryWeeklyExecutionReceiptPair = Readonly<{
  artifactSha256: string;
  proofSha256: string;
}>;

export type ReaderSummaryWeeklyExecutionReceiptFailure = Readonly<{
  category: ReaderSummaryWeeklyFailureCategory;
  retryable: boolean;
  code: string;
}>;

export type ReaderSummaryWeeklySubscriptionRuntimeFailure = Readonly<{
  retryable: boolean;
  code: string;
  causeCategory: string;
  reconnectRequired: boolean;
}>;

export class ReaderSummaryWeeklySubscriptionRuntimeFailureError extends Error {
  readonly failure: ReaderSummaryWeeklySubscriptionRuntimeFailure;

  constructor(
    failure: ReaderSummaryWeeklySubscriptionRuntimeFailure,
    message: string,
  ) {
    super(message);
    this.name = "ReaderSummaryWeeklySubscriptionRuntimeFailureError";
    this.failure = Object.freeze({ ...failure });
    Object.defineProperty(this, "cause", {
      configurable: true,
      enumerable: false,
      value: this.failure,
    });
  }
}

export const readerSummaryWeeklySubscriptionRuntimeFailureFromResult = (
  failure: Readonly<{
    code: string;
    safeMessage: string;
    retryable: boolean;
    reconnectRequired: boolean;
    causeCategory: string;
  }> | undefined,
  status: string,
): ReaderSummaryWeeklySubscriptionRuntimeFailureError =>
  new ReaderSummaryWeeklySubscriptionRuntimeFailureError(
    Object.freeze({
      code: failure?.code ?? `agent_runtime.${status}`,
      retryable: failure?.retryable ?? false,
      causeCategory: failure?.causeCategory ?? status,
      reconnectRequired: failure?.reconnectRequired ?? false,
    }),
    failure?.safeMessage ?? "Reader summary weekly agent-runtime task did not complete",
  );

type ReceiptRow = Readonly<{
  id: string;
  tenant_id: string;
  workspace_id: string;
  scope_type: string;
  scope_key: string;
  interest_id: string | null;
  cadence: string;
  period_started_at: string;
  period_ended_at: string;
  period_timezone: string;
  period_key: string;
  status: string;
  idempotency_key: string;
  requested_at: string;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  reader_summary_artifact_id: string | null;
  failure_reason: string | null;
}>;

type ReceiptIdentity = Readonly<{
  id: string;
  identity: string;
  sha256: string;
  scopeType: "workspace" | "interest";
  scopeKey: string;
  interestId: string | null;
  periodStartedAt: string;
  periodEndedAt: string;
  periodKey: string;
}>;

type ReceiptFencePhase =
  | "model"
  | "retryable_failure"
  | "terminal_failure"
  | "recoverable_pair"
  | "publishing_pair";

type ReceiptFence = Readonly<{
  schemaVersion: typeof receiptFenceSchemaVersion;
  receiptSha256: string;
  phase: ReceiptFencePhase;
  token: string;
  attemptNumber: number;
  artifactSha256?: string;
  proofSha256?: string;
  leaseExpiresAt?: string;
  failure?: ReaderSummaryWeeklyExecutionReceiptFailure;
}>;

export const acquireReaderSummaryWeeklyExecutionReceipt = async (
  client: ReaderSummaryWeeklyProductionPostgresClient,
  params: Readonly<{
    scope: ReaderSummaryWeeklyProductionScope;
    window: ReaderSummaryWeeklyProductionWindow;
    sealId: string;
    sealSha256: string;
    anchorJobId: string;
    now: Date;
    attemptNumber?: number;
  }>,
): Promise<ReaderSummaryWeeklyExecutionReceipt> => {
  const receipt = receiptIdentity(params);
  const attemptNumber = exactAttemptNumber(params.attemptNumber ?? 1);
  const now = exactNow(params.now);
  const initialFence = receiptFenceText({
    receiptSha256: receipt.sha256,
    phase: "model",
    attemptNumber,
    leaseExpiresAt: new Date(
      now + readerSummaryWeeklyExecutionReceiptModelLeaseMs,
    ).toISOString(),
  });
  const anchor = await client.query<{ id: string }>(
    `
      SELECT job.id::text AS id
      FROM reader_summary_jobs AS job
      WHERE job.tenant_id = $1::uuid
        AND job.workspace_id = $2::uuid
        AND job.id = $3::uuid
        AND job.scope_type = $4
        AND job.scope_key = $5
        AND job.cadence = 'daily'
        AND job.period_started_at = $6::timestamptz
      FOR UPDATE OF job
    `,
    [
      params.scope.tenantId,
      params.scope.workspaceId,
      params.anchorJobId,
      receipt.scopeType,
      receipt.scopeKey,
      receipt.periodStartedAt,
    ],
  );
  if (anchor.rows.length !== 1 || anchor.rows[0]?.id !== params.anchorJobId) {
    throw new Error(
      "Reader summary weekly execution receipt anchor is missing or ambiguous",
    );
  }

  const inserted = await client.query<{ id: string }>(
    `
      INSERT INTO reader_summary_jobs (
        id, tenant_id, workspace_id, scope_type, scope_key, interest_id,
        cadence, period_started_at, period_ended_at, period_timezone,
        period_key, user_id, subscription_id, status, idempotency_key,
        requested_at, started_at, completed_at, failed_at,
        reader_summary_artifact_id, failure_reason, created_at, updated_at
      ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, $4, $5, $6::uuid,
        'weekly', $7::timestamptz, $8::timestamptz, 'UTC',
        $9, NULL, NULL, 'RUNNING', $10,
        transaction_timestamp(), transaction_timestamp(), NULL, NULL,
        NULL, $11, transaction_timestamp(), transaction_timestamp()
      )
      ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
      RETURNING id::text AS id
    `,
    [
      receipt.id,
      params.scope.tenantId,
      params.scope.workspaceId,
      receipt.scopeType,
      receipt.scopeKey,
      receipt.interestId,
      receipt.periodStartedAt,
      receipt.periodEndedAt,
      receipt.periodKey,
      receipt.identity,
      initialFence,
    ],
  );
  if (
    inserted.rows.length > 1 ||
    (inserted.rows.length === 1 && inserted.rows[0]?.id !== receipt.id)
  ) {
    throw new Error(
      "Reader summary weekly execution receipt insert was ambiguous",
    );
  }

  const selected = await client.query<ReceiptRow>(
    `
      SELECT
        job.id::text, job.tenant_id::text, job.workspace_id::text,
        job.scope_type, job.scope_key, job.interest_id::text,
        job.cadence,
        to_char(job.period_started_at AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS period_started_at,
        to_char(job.period_ended_at AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS period_ended_at,
        job.period_timezone, job.period_key, job.status::text,
        job.idempotency_key,
        to_char(job.requested_at AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS requested_at,
        to_char(job.started_at AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS started_at,
        to_char(job.completed_at AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS completed_at,
        to_char(job.failed_at AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS failed_at,
        job.reader_summary_artifact_id::text,
        job.failure_reason
      FROM reader_summary_jobs AS job
      WHERE job.tenant_id = $1::uuid
        AND job.workspace_id = $2::uuid
        AND job.scope_type = $3
        AND job.scope_key = $4
        AND job.cadence = 'weekly'
        AND job.period_started_at = $5::timestamptz
        AND job.period_ended_at = $6::timestamptz
        AND job.period_timezone = 'UTC'
        AND left(job.idempotency_key, 43) =
          'reader_summary.weekly_execution_receipt.v1:'
      FOR UPDATE OF job
    `,
    [
      params.scope.tenantId,
      params.scope.workspaceId,
      receipt.scopeType,
      receipt.scopeKey,
      receipt.periodStartedAt,
      receipt.periodEndedAt,
    ],
  );
  if (inserted.rows.length === 0 && selected.rows.length === 0) {
    throw Object.assign(
      new Error("Reader summary weekly execution receipt snapshot is stale"),
      { code: "40001" },
    );
  }
  const selectedReceipt = receiptFromRow(selected.rows[0], receipt, params);
  if (selected.rows.length !== 1 || selectedReceipt === undefined) {
    throw new Error(
      "Reader summary weekly execution receipt is ambiguous or diverged",
    );
  }
  if (inserted.rows.length === 1) {
    if (
      selectedReceipt.state !== "running" ||
      selectedReceipt.fence !== initialFence
    ) {
      throw new Error("Reader summary weekly execution receipt insert diverged");
    }
    return Object.freeze({ ...selectedReceipt, state: "acquired" as const });
  }
  return selectedReceipt.state === "failed"
    ? reopenRetryableReceipt(client, selectedReceipt, attemptNumber, now)
    : selectedReceipt;
};
export const claimReaderSummaryWeeklyExecutionReceiptPair = async (
  client: ReaderSummaryWeeklyProductionPostgresClient,
  receipt: ReaderSummaryWeeklyExecutionReceipt,
  params: ReaderSummaryWeeklyExecutionReceiptPair & Readonly<{ now: Date }>,
): Promise<ReaderSummaryWeeklyExecutionReceipt> => {
  const pair = exactPair(params);
  const currentFence = receiptFenceFromReceipt(receipt);
  assertPairClaimable(receipt, currentFence, pair, params.now);
  const nextFence = receiptFenceText({
    receiptSha256: receipt.sha256,
    phase: "publishing_pair",
    attemptNumber: receipt.attemptNumber,
    artifactSha256: pair.artifactSha256,
    proofSha256: pair.proofSha256,
    leaseExpiresAt: new Date(
      exactNow(params.now) + readerSummaryWeeklyExecutionReceiptPublicationLeaseMs,
    ).toISOString(),
  });
  const result = await client.query<{ id: string }>(
    `
      UPDATE reader_summary_jobs
      SET started_at = transaction_timestamp(),
          failure_reason = $4, updated_at = transaction_timestamp()
      WHERE id = $1::uuid
        AND idempotency_key = $2
        AND status = 'RUNNING'
        AND failure_reason IS NOT DISTINCT FROM $3
      RETURNING id::text AS id
    `,
    [receipt.id, receipt.identity, receipt.fence, nextFence],
  );
  if (result.rows.length !== 1 || result.rows[0]?.id !== receipt.id) {
    throw new Error(
      "Reader summary weekly execution receipt pair claim lost exact fencing",
    );
  }
  return Object.freeze({
    ...receipt,
    state: "publishing",
    fence: nextFence,
  });
};
export const releaseReaderSummaryWeeklyExecutionReceiptPair = async (
  client: ReaderSummaryWeeklyProductionPostgresClient,
  receipt: ReaderSummaryWeeklyExecutionReceipt,
): Promise<void> => {
  const fence = receiptFenceFromReceipt(receipt);
  if (receipt.state !== "publishing" || fence?.phase !== "publishing_pair") {
    throw new Error("Reader summary weekly receipt has no publishing fence");
  }
  const recoveryFence = receiptFenceText({
    receiptSha256: receipt.sha256,
    phase: "recoverable_pair",
    // A recoverable pair records the next bounded publish attempt. This keeps
    // restarts from resetting a same-identity republish to attempt one.
    attemptNumber: exactAttemptNumber(receipt.attemptNumber + 1),
    artifactSha256: fence.artifactSha256,
    proofSha256: fence.proofSha256,
  });
  const result = await client.query<{ id: string }>(
    `
      UPDATE reader_summary_jobs
      SET failure_reason = $4, updated_at = transaction_timestamp()
      WHERE id = $1::uuid
        AND idempotency_key = $2
        AND status = 'RUNNING'
        AND failure_reason = $3
      RETURNING id::text AS id
    `,
    [receipt.id, receipt.identity, receipt.fence, recoveryFence],
  );
  if (result.rows.length !== 1 || result.rows[0]?.id !== receipt.id) {
    throw new Error(
      "Reader summary weekly execution receipt release lost exact fencing",
    );
  }
};
export const failReaderSummaryWeeklyExecutionReceiptBeforeDurableOutput = async (
  client: ReaderSummaryWeeklyProductionPostgresClient,
  receipt: ReaderSummaryWeeklyExecutionReceipt,
  failure: ReaderSummaryWeeklyExecutionReceiptFailure,
): Promise<void> => {
  const fence = receiptFenceFromReceipt(receipt);
  if (receipt.state !== "acquired" || fence?.phase !== "model") {
    throw new Error("Reader summary weekly receipt cannot fail outside model fencing");
  }
  const safeFailure = exactFailure(failure);
  const persistedFailure = receipt.attemptNumber === maxReceiptAttempts
    ? { ...safeFailure, retryable: false }
    : safeFailure;
  const failureFence = receiptFenceText({
    receiptSha256: receipt.sha256,
    phase: persistedFailure.retryable ? "retryable_failure" : "terminal_failure",
    attemptNumber: receipt.attemptNumber,
    failure: persistedFailure,
  });
  const result = await client.query<{ id: string }>(
    `
      UPDATE reader_summary_jobs
      SET status = 'FAILED', failed_at = transaction_timestamp(),
          failure_reason = $4, updated_at = transaction_timestamp()
      WHERE id = $1::uuid
        AND idempotency_key = $2
        AND status = 'RUNNING'
        AND failure_reason = $3
      RETURNING id::text AS id
    `,
    [receipt.id, receipt.identity, receipt.fence, failureFence],
  );
  if (result.rows.length !== 1 || result.rows[0]?.id !== receipt.id) {
    throw new Error(
      "Reader summary weekly execution receipt failure lost exact fencing",
    );
  }
};
export const failReaderSummaryWeeklyExecutionReceiptAfterDurableOutput = async (
  client: ReaderSummaryWeeklyProductionPostgresClient,
  receipt: ReaderSummaryWeeklyExecutionReceipt,
  failure: ReaderSummaryWeeklyExecutionReceiptFailure,
): Promise<void> => {
  const fence = receiptFenceFromReceipt(receipt);
  if (receipt.state !== "publishing" || fence?.phase !== "publishing_pair") {
    throw new Error("Reader summary weekly receipt cannot fail outside publishing fencing");
  }
  const failureFence = receiptFenceText({
    receiptSha256: receipt.sha256,
    phase: "terminal_failure",
    attemptNumber: receipt.attemptNumber,
    failure: { ...exactFailure(failure), retryable: false },
  });
  const result = await client.query<{ id: string }>(
    `
      UPDATE reader_summary_jobs
      SET status = 'FAILED', failed_at = transaction_timestamp(),
          failure_reason = $4, updated_at = transaction_timestamp()
      WHERE id = $1::uuid
        AND idempotency_key = $2
        AND status = 'RUNNING'
        AND failure_reason = $3
      RETURNING id::text AS id
    `,
    [receipt.id, receipt.identity, receipt.fence, failureFence],
  );
  if (result.rows.length !== 1 || result.rows[0]?.id !== receipt.id) {
    throw new Error(
      "Reader summary weekly execution receipt terminal failure lost exact fencing",
    );
  }
};
export const completeReaderSummaryWeeklyExecutionReceipt = async (
  client: ReaderSummaryWeeklyProductionPostgresClient,
  receipt: ReaderSummaryWeeklyExecutionReceipt,
): Promise<void> => {
  const fence = receiptFenceFromReceipt(receipt);
  if (receipt.state !== "publishing" || fence?.phase !== "publishing_pair") {
    throw new Error("Reader summary weekly receipt cannot complete without publishing fencing");
  }
  const result = await client.query<{ id: string }>(
    `
      UPDATE reader_summary_jobs
      SET status = 'COMPLETED', completed_at = transaction_timestamp(),
          updated_at = transaction_timestamp()
      WHERE id = $1::uuid
        AND idempotency_key = $2
        AND status = 'RUNNING'
        AND completed_at IS NULL
        AND failed_at IS NULL
        AND failure_reason = $3
      RETURNING id::text AS id
    `,
    [receipt.id, receipt.identity, receipt.fence],
  );
  if (result.rows.length !== 1 || result.rows[0]?.id !== receipt.id) {
    throw new Error(
      "Reader summary weekly execution receipt completion lost exact fencing",
    );
  }
};
export const reconcileReaderSummaryWeeklyExecutionReceiptPublication = async (
  client: ReaderSummaryWeeklyProductionPostgresClient,
  receipt: ReaderSummaryWeeklyExecutionReceipt,
  params: Readonly<{
    scope: ReaderSummaryWeeklyProductionScope;
    window: ReaderSummaryWeeklyProductionWindow;
  }>,
): Promise<boolean> => {
  const fence = receiptFenceFromReceipt(receipt);
  if (
    fence === undefined ||
    (receipt.state !== "acquired" &&
      receipt.state !== "running" &&
      receipt.state !== "publishing")
  ) return false;
  const scopeKey = readerSummaryWeeklyScopeKey(params.scope.scope);
  const publication = await client.query<{ id: string }>(
    `
      SELECT publication.id::text AS id
      FROM reader_summary_publications AS publication
      WHERE publication.tenant_id = $1::uuid
        AND publication.workspace_id = $2::uuid
        AND publication.scope_type = $3
        AND publication.scope_key = $4
        AND publication.cadence = 'weekly'
        AND publication.period_started_at = $5::timestamptz
        AND publication.period_ended_at = $6::timestamptz
        AND publication.publication_kind = 'WEEKLY_CERTIFIED'
      FOR KEY SHARE OF publication
    `,
    [
      params.scope.tenantId,
      params.scope.workspaceId,
      params.scope.scope.type,
      scopeKey,
      `${params.window.weekStartedOn}T00:00:00.000Z`,
      new Date(
        Date.parse(`${params.window.weekEndedOn}T00:00:00.000Z`) + 86_400_000,
      ).toISOString(),
    ],
  );
  if (publication.rows.length > 1) {
    throw new Error("Reader summary weekly receipt publication is ambiguous");
  }
  if (publication.rows.length === 0) return false;
  const result = await client.query<{ id: string }>(
    `
      UPDATE reader_summary_jobs
      SET status = 'COMPLETED', completed_at = transaction_timestamp(),
          updated_at = transaction_timestamp()
      WHERE id = $1::uuid
        AND idempotency_key = $2
        AND status = 'RUNNING'
        AND completed_at IS NULL
        AND failed_at IS NULL
        AND failure_reason = $3
      RETURNING id::text AS id
    `,
    [receipt.id, receipt.identity, receipt.fence],
  );
  if (result.rows.length === 1 && result.rows[0]?.id === receipt.id) return true;
  if (result.rows.length !== 0) {
    throw new Error("Reader summary weekly receipt reconciliation is ambiguous");
  }
  const completed = await client.query<{ id: string }>(
    `
      SELECT job.id::text AS id
      FROM reader_summary_jobs AS job
      WHERE job.id = $1::uuid
        AND job.idempotency_key = $2
        AND job.status = 'COMPLETED'
        AND job.completed_at IS NOT NULL
        AND job.failed_at IS NULL
        AND job.failure_reason = $3
      FOR KEY SHARE OF job
    `,
    [receipt.id, receipt.identity, receipt.fence],
  );
  if (completed.rows.length === 1 && completed.rows[0]?.id === receipt.id) {
    return true;
  }
  throw new Error("Reader summary weekly receipt reconciliation lost exact fencing");
};
export const terminalizeReaderSummaryWeeklyExecutionReceiptStaleModelFence = async (
  client: ReaderSummaryWeeklyProductionPostgresClient,
  receipt: ReaderSummaryWeeklyExecutionReceipt,
  now: Date,
): Promise<boolean> => {
  const fence = receiptFenceFromReceipt(receipt);
  if (
    receipt.state !== "running" ||
    fence?.phase !== "model" ||
    !staleModelFence(fence, now)
  ) return false;
  const terminalFence = receiptFenceText({
    receiptSha256: receipt.sha256,
    phase: "terminal_failure",
    attemptNumber: receipt.attemptNumber,
    failure: { category: "schema", retryable: false, code: "stale_model_fence" },
  });
  const result = await client.query<{ id: string }>(
    `
      UPDATE reader_summary_jobs
      SET status = 'FAILED', failed_at = transaction_timestamp(),
          failure_reason = $4, updated_at = transaction_timestamp()
      WHERE id = $1::uuid
        AND idempotency_key = $2
        AND status = 'RUNNING'
        AND failure_reason = $3
      RETURNING id::text AS id
    `,
    [receipt.id, receipt.identity, receipt.fence, terminalFence],
  );
  if (result.rows.length !== 1 || result.rows[0]?.id !== receipt.id) {
    throw new Error("Reader summary weekly stale model fence lost exact fencing");
  }
  return true;
};
const reopenRetryableReceipt = async (
  client: ReaderSummaryWeeklyProductionPostgresClient,
  receipt: ReaderSummaryWeeklyExecutionReceipt,
  requestedAttemptNumber: number,
  now: number,
): Promise<ReaderSummaryWeeklyExecutionReceipt> => {
  const fence = receiptFenceFromReceipt(receipt);
  const nextAttemptNumber = requestedAttemptNumber === 1
    ? receipt.attemptNumber + 1
    : requestedAttemptNumber;
  if (
    fence?.phase !== "retryable_failure" ||
    fence.failure?.retryable !== true ||
    nextAttemptNumber !== receipt.attemptNumber + 1 ||
    nextAttemptNumber > maxReceiptAttempts
  ) {
    return receipt;
  }
  const nextFence = receiptFenceText({
    receiptSha256: receipt.sha256,
    phase: "model",
    attemptNumber: nextAttemptNumber,
    leaseExpiresAt: new Date(
      now + readerSummaryWeeklyExecutionReceiptModelLeaseMs,
    ).toISOString(),
  });
  const result = await client.query<{ id: string }>(
    `
      UPDATE reader_summary_jobs
      SET status = 'RUNNING', started_at = transaction_timestamp(),
          failed_at = NULL, failure_reason = $4,
          updated_at = transaction_timestamp()
      WHERE id = $1::uuid
        AND idempotency_key = $2
        AND status = 'FAILED'
        AND failure_reason = $3
      RETURNING id::text AS id
    `,
    [receipt.id, receipt.identity, receipt.fence, nextFence],
  );
  if (result.rows.length !== 1 || result.rows[0]?.id !== receipt.id) {
    throw new Error(
      "Reader summary weekly execution receipt retry lost exact fencing",
    );
  }
  return Object.freeze({
    ...receipt,
    state: "acquired",
    attemptNumber: nextAttemptNumber,
    fence: nextFence,
  });
};
const receiptIdentity = (params: Readonly<{
  scope: ReaderSummaryWeeklyProductionScope;
  window: ReaderSummaryWeeklyProductionWindow;
  sealId: string;
  sealSha256: string;
}>): ReceiptIdentity => {
  if (!/^[0-9a-f]{64}$/u.test(params.sealSha256)) {
    throw new Error("Reader summary weekly execution receipt seal is invalid");
  }
  const scopeKey = readerSummaryWeeklyScopeKey(params.scope.scope);
  const body = {
    schemaVersion: readerSummaryWeeklyExecutionReceiptSchemaVersion,
    tenantId: params.scope.tenantId,
    workspaceId: params.scope.workspaceId,
    scopeType: params.scope.scope.type,
    scopeKey,
    weekStartedOn: params.window.weekStartedOn,
    weekEndedOn: params.window.weekEndedOn,
    sealId: params.sealId,
    sealSha256: params.sealSha256,
  };
  const canonical = canonicalizeReaderSummaryWeeklyJson(
    body,
    "weekly execution receipt identity",
  );
  const periodStartedAt = `${params.window.weekStartedOn}T00:00:00.000Z`;
  const periodEndedAt = new Date(
    Date.parse(`${params.window.weekEndedOn}T00:00:00.000Z`) + 86_400_000,
  ).toISOString();
  return Object.freeze({
    id: uuidFromSha256(canonical.sha256),
    identity: `${readerSummaryWeeklyExecutionReceiptSchemaVersion}:${canonical.sha256}`,
    sha256: canonical.sha256,
    scopeType: params.scope.scope.type,
    scopeKey,
    interestId:
      params.scope.scope.type === "interest"
        ? params.scope.scope.interestId
        : null,
    periodStartedAt,
    periodEndedAt,
    periodKey: `weekly-execution-receipt:${canonical.sha256}`,
  });
};
const receiptFromRow = (
  row: ReceiptRow | undefined,
  receipt: ReceiptIdentity,
  params: Readonly<{ scope: ReaderSummaryWeeklyProductionScope }>,
): ReaderSummaryWeeklyExecutionReceipt | undefined => {
  if (!exactReceiptRow(row, receipt, params) || row === undefined) {
    return undefined;
  }
  const fence = row.failure_reason === null
    ? null
    : parseReceiptFence(row.failure_reason, receipt.sha256);
  if (row.failure_reason !== null && fence === undefined) return undefined;
  const attemptNumber = fence?.attemptNumber ?? 1;
  if (
    row.status === "RUNNING" &&
    row.completed_at === null &&
    row.failed_at === null &&
    (fence?.phase === "model" ||
      fence?.phase === "recoverable_pair" ||
      fence?.phase === "publishing_pair")
  ) {
    return Object.freeze({
      id: receipt.id,
      identity: receipt.identity,
      sha256: receipt.sha256,
      state: "running",
      attemptNumber,
      fence: row.failure_reason,
    });
  }
  if (
    row.status === "COMPLETED" &&
    row.completed_at !== null &&
    row.failed_at === null &&
    (row.failure_reason === null ||
      fence?.phase === "model" ||
      fence?.phase === "recoverable_pair" ||
      fence?.phase === "publishing_pair")
  ) {
    return Object.freeze({
      id: receipt.id,
      identity: receipt.identity,
      sha256: receipt.sha256,
      state: "completed",
      attemptNumber,
      fence: row.failure_reason,
    });
  }
  if (
    row.status === "FAILED" &&
    row.completed_at === null &&
    row.failed_at !== null &&
    (fence?.phase === "retryable_failure" ||
      fence?.phase === "terminal_failure")
  ) {
    return Object.freeze({
      id: receipt.id,
      identity: receipt.identity,
      sha256: receipt.sha256,
      state: "failed",
      attemptNumber,
      fence: row.failure_reason,
    });
  }
  return undefined;
};
const exactReceiptRow = (
  row: ReceiptRow | undefined,
  receipt: ReceiptIdentity,
  params: Readonly<{ scope: ReaderSummaryWeeklyProductionScope }>,
): boolean =>
  row !== undefined &&
  row.id === receipt.id &&
  row.tenant_id === params.scope.tenantId &&
  row.workspace_id === params.scope.workspaceId &&
  row.scope_type === receipt.scopeType &&
  row.scope_key === receipt.scopeKey &&
  row.interest_id === receipt.interestId &&
  row.cadence === "weekly" &&
  row.period_started_at === receipt.periodStartedAt &&
  row.period_ended_at === receipt.periodEndedAt &&
  row.period_timezone === "UTC" &&
  row.period_key === receipt.periodKey &&
  row.idempotency_key === receipt.identity &&
  row.started_at !== null &&
  row.reader_summary_artifact_id === null;
const receiptFenceFromReceipt = (
  receipt: ReaderSummaryWeeklyExecutionReceipt,
): ReceiptFence | undefined =>
  receipt.fence === null
    ? undefined
    : parseReceiptFence(receipt.fence, receipt.sha256);
const assertPairClaimable = (
  receipt: ReaderSummaryWeeklyExecutionReceipt,
  fence: ReceiptFence | undefined,
  pair: ReaderSummaryWeeklyExecutionReceiptPair,
  now: Date,
): void => {
  if (receipt.state === "acquired" && fence?.phase === "model") return;
  if (receipt.state !== "running") {
    throw new Error("Reader summary weekly receipt is not recoverable");
  }
  if (fence === undefined || fence.phase === "model") return;
  if (
    fence.artifactSha256 !== pair.artifactSha256 ||
    fence.proofSha256 !== pair.proofSha256
  ) {
    throw new Error(
      "Reader summary weekly execution receipt pair identity/hash mismatch",
    );
  }
  if (fence.phase === "recoverable_pair") return;
  if (
    fence.phase === "publishing_pair" &&
    fence.leaseExpiresAt !== undefined &&
    Date.parse(fence.leaseExpiresAt) <= exactNow(now)
  ) {
    return;
  }
  throw new Error("Reader summary weekly execution receipt publishing fence is active");
};
const staleModelFence = (fence: ReceiptFence, now: Date): boolean =>
  fence.leaseExpiresAt === undefined ||
  Date.parse(fence.leaseExpiresAt) <= exactNow(now);
const exactPair = (
  value: ReaderSummaryWeeklyExecutionReceiptPair,
): ReaderSummaryWeeklyExecutionReceiptPair => {
  if (
    !/^[0-9a-f]{64}$/u.test(value.artifactSha256) ||
    !/^[0-9a-f]{64}$/u.test(value.proofSha256)
  ) {
    throw new Error("Reader summary weekly execution receipt pair hash is invalid");
  }
  return Object.freeze({ ...value });
};
const receiptFenceText = (params: Readonly<{
  receiptSha256: string;
  phase: ReceiptFencePhase;
  attemptNumber: number;
  artifactSha256?: string;
  proofSha256?: string;
  leaseExpiresAt?: string;
  failure?: ReaderSummaryWeeklyExecutionReceiptFailure;
}>): string => {
  const body = {
    schemaVersion: receiptFenceSchemaVersion,
    receiptSha256: exactSha(params.receiptSha256, "receipt fence sha"),
    phase: params.phase,
    token: randomUUID(),
    attemptNumber: exactAttemptNumber(params.attemptNumber),
    ...(params.artifactSha256 === undefined
      ? {}
      : { artifactSha256: exactSha(params.artifactSha256, "artifact sha") }),
    ...(params.proofSha256 === undefined
      ? {}
      : { proofSha256: exactSha(params.proofSha256, "proof sha") }),
    ...(params.leaseExpiresAt === undefined
      ? {}
      : { leaseExpiresAt: exactTimestamp(params.leaseExpiresAt) }),
    ...(params.failure === undefined ? {} : { failure: exactFailure(params.failure) }),
  };
  assertFenceShape(body);
  return `${receiptFencePrefix}${canonicalizeReaderSummaryWeeklyJson(
    body,
    "weekly execution receipt fence",
  ).json}`;
};
const parseReceiptFence = (
  value: string,
  receiptSha256: string,
): ReceiptFence | undefined => {
  if (!value.startsWith(receiptFencePrefix)) return undefined;
  try {
    const body = JSON.parse(value.slice(receiptFencePrefix.length)) as unknown;
    if (
      canonicalizeReaderSummaryWeeklyJson(body, "weekly execution receipt fence")
        .json !== value.slice(receiptFencePrefix.length)
    ) {
      return undefined;
    }
    assertFenceShape(body);
    const fence = body as ReceiptFence;
    return fence.receiptSha256 === receiptSha256 ? Object.freeze(fence) : undefined;
  } catch {
    return undefined;
  }
};
const assertFenceShape = (value: unknown): void => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Reader summary weekly execution receipt fence is invalid");
  }
  const fence = value as Record<string, unknown>;
  const phase = fence.phase;
  const attemptNumber = fence.attemptNumber;
  const expectedKeys = phase === "model"
    ? fence.leaseExpiresAt === undefined
      ? ["attemptNumber", "phase", "receiptSha256", "schemaVersion", "token"]
      : ["attemptNumber", "leaseExpiresAt", "phase", "receiptSha256", "schemaVersion", "token"]
    : phase === "retryable_failure" || phase === "terminal_failure"
      ? ["attemptNumber", "failure", "phase", "receiptSha256", "schemaVersion", "token"]
      : phase === "recoverable_pair"
        ? ["artifactSha256", "attemptNumber", "phase", "proofSha256", "receiptSha256", "schemaVersion", "token"]
        : phase === "publishing_pair"
          ? ["artifactSha256", "attemptNumber", "leaseExpiresAt", "phase", "proofSha256", "receiptSha256", "schemaVersion", "token"]
          : undefined;
  if (
    expectedKeys === undefined ||
    !sameStrings(Object.keys(fence).sort(), expectedKeys)
  ) {
    throw new Error("Reader summary weekly execution receipt fence is invalid");
  }
  if (
    fence.schemaVersion !== receiptFenceSchemaVersion ||
    typeof fence.receiptSha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(fence.receiptSha256) ||
    typeof fence.token !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(fence.token) ||
    typeof attemptNumber !== "number" ||
    !Number.isInteger(attemptNumber) ||
    attemptNumber < 1 ||
    attemptNumber > maxReceiptAttempts
  ) {
    throw new Error("Reader summary weekly execution receipt fence is invalid");
  }
  if (phase === "retryable_failure" || phase === "terminal_failure") {
    const failure = exactFailure(fence.failure as ReaderSummaryWeeklyExecutionReceiptFailure);
    if (
      (phase === "retryable_failure") !== failure.retryable ||
      canonicalizeReaderSummaryWeeklyJson(failure).json !==
        canonicalizeReaderSummaryWeeklyJson(fence.failure).json
    ) {
      throw new Error("Reader summary weekly execution receipt fence is invalid");
    }
  }
  if (phase === "model" && fence.leaseExpiresAt !== undefined) {
    exactTimestamp(fence.leaseExpiresAt);
  }
  if (
    phase === "recoverable_pair" ||
    phase === "publishing_pair"
  ) {
    exactSha(fence.artifactSha256, "artifact sha");
    exactSha(fence.proofSha256, "proof sha");
  }
  if (phase === "publishing_pair") {
    exactTimestamp(fence.leaseExpiresAt);
  }
};
const exactFailure = (
  value: ReaderSummaryWeeklyExecutionReceiptFailure,
): ReaderSummaryWeeklyExecutionReceiptFailure => {
  if (
    value === null ||
    typeof value !== "object" ||
    !["infrastructure", "domain", "schema", "editorial", "model_refusal"].includes(
      value.category,
    ) ||
    typeof value.retryable !== "boolean" ||
    !safeToken(value.code)
  ) {
    throw new Error("Reader summary weekly execution receipt failure is invalid");
  }
  return Object.freeze({ ...value });
};
const exactAttemptNumber = (value: number): number => {
  if (!Number.isInteger(value) || value < 1 || value > maxReceiptAttempts) {
    throw new Error("Reader summary weekly execution receipt attempt is invalid");
  }
  return value;
};
const exactNow = (value: Date): number => {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("Reader summary weekly execution receipt clock is invalid");
  }
  return value.getTime();
};
const exactTimestamp = (value: unknown): string => {
  if (typeof value !== "string" || new Date(value).toISOString() !== value) {
    throw new Error("Reader summary weekly execution receipt timestamp is invalid");
  }
  return value;
};
const exactSha = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`Reader summary weekly execution receipt ${label} is invalid`);
  }
  return value;
};
const safeToken = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/u.test(value);

const sameStrings = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);
const uuidFromSha256 = (sha256: string): string => {
  const variant = (8 + (Number.parseInt(sha256[16]!, 16) & 3)).toString(16);
  return `${sha256.slice(0, 8)}-${sha256.slice(8, 12)}-5${sha256.slice(13, 16)}-${variant}${sha256.slice(17, 20)}-${sha256.slice(20, 32)}`;
};
