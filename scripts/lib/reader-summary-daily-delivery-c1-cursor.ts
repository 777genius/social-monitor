import {
  mapReaderSummaryDailyBoundedMaintenanceClaimRow,
  type ReaderSummaryDailyClaimRow,
  type ReaderSummaryDailySqlClient,
} from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-daily-execution-cursor-row";
import type { ReaderSummaryDailyBoundedMaintenanceClaimPort } from "@social-monitor/summary/ports/reader-summary-daily-bounded-maintenance-claim.port";
import type {
  ReaderSummaryDailyClaimResult,
  ReaderSummaryDailyExecutionCursorClaim,
  ReaderSummaryDailyExecutionCursorPort,
} from "@social-monitor/summary/ports/reader-summary-daily-execution-cursor.port";

export const readerSummaryDailyDeliveryC1Mode = "exact" as const;
export const readerSummaryDailyDeliveryC1FirstDate = "2026-07-23" as const;
const boundedFirstDate = "2026-07-31";
const boundedLastDate = "2026-08-03";
const c1LegacyLastDate = "2026-07-24";
const maxCursorRouteAttempts = 4;

type C1Cursor = ReaderSummaryDailyExecutionCursorPort &
  ReaderSummaryDailyBoundedMaintenanceClaimPort;

export const createReaderSummaryDailyDeliveryC1ClaimNext = (
  params: Readonly<{
    client: ReaderSummaryDailySqlClient;
    cursor: C1Cursor;
    claim: ReaderSummaryDailyExecutionCursorClaim;
    mode: string | undefined;
    recoveryThrough: string;
    now?: () => Date;
  }>,
): (() => Promise<ReaderSummaryDailyClaimResult>) => {
  assertC1Claim(params);
  return async () => {
    const invokedAt = (params.now ?? (() => new Date()))().toISOString();
    assertFrozenInvokedAt(invokedAt, params.recoveryThrough);
    for (let attempt = 1; attempt <= maxCursorRouteAttempts; attempt += 1) {
      const advanced = await advanceC0Cursor({
        client: params.client,
        claim: params.claim,
        invokedAt,
      });
      assertExactEligibleThrough(
        advanced.eligibleThrough,
        params.recoveryThrough,
      );
      const nextDate = advanced.nextUnresolvedUtcDate;
      assertCursorPosition(nextDate, params.recoveryThrough);
      if (nextDate <= c1LegacyLastDate) {
        const legacy = await claimC1Legacy({
          client: params.client,
          claim: params.claim,
          requestedUtcDate: nextDate,
          invokedAt,
        });
        if (
          legacy.kind === "stale_cursor" ||
          legacy.kind === "bounded_caught_up"
        ) {
          assertCursorPosition(
            legacy.nextUnresolvedUtcDate,
            params.recoveryThrough,
          );
          continue;
        }
        return assertC1ClaimResult(legacy, params.recoveryThrough, "exact");
      }
      if (nextDate >= boundedFirstDate && nextDate <= boundedLastDate) {
        const bounded = await params.cursor.claimExactBoundedMaintenance({
          tenantId: params.claim.tenantId,
          workspaceId: params.claim.workspaceId,
          workerId: params.claim.workerId,
          requestedUtcDate: nextDate,
          invokedAt,
        });
        if (
          bounded.kind === "stale_cursor" ||
          bounded.kind === "bounded_caught_up"
        ) {
          assertCursorPosition(
            bounded.nextUnresolvedUtcDate,
            params.recoveryThrough,
          );
          continue;
        }
        return assertC1ClaimResult(bounded, params.recoveryThrough, "bounded");
      }
      const ordinary = await params.cursor.claimNext({
        ...params.claim,
        invokedAt,
      });
      return assertC1ClaimResult(ordinary, params.recoveryThrough, "exact");
    }
    throw new Error("Daily delivery C1 cursor route did not stabilize");
  };
};

const claimC1Legacy = async (
  params: Readonly<{
    client: ReaderSummaryDailySqlClient;
    claim: ReaderSummaryDailyExecutionCursorClaim;
    requestedUtcDate: string;
    invokedAt: string;
  }>,
) =>
  params.client.serializable(async (transaction) => {
    await transaction.query(
      `SELECT
        set_config('social_monitor.tenant_id', $1::UUID::TEXT, true),
        set_config('social_monitor.workspace_id', $2::UUID::TEXT, true),
        set_config('social_monitor.system_access', 'false', true),
        set_config('social_monitor.daily_delivery_c1_mode', 'exact', true)`,
      [params.claim.tenantId, params.claim.workspaceId],
    );
    const result = await transaction.query<ReaderSummaryDailyClaimRow>(
      `SELECT *
       FROM public."claim_reader_summary_daily_execution_c1_legacy"(
         $1::UUID, $2::UUID, $3::TEXT, $4::DATE, $5::TIMESTAMPTZ
       )`,
      [
        params.claim.tenantId,
        params.claim.workspaceId,
        params.claim.workerId,
        params.requestedUtcDate,
        params.invokedAt,
      ],
    );
    const row = result.rows[0];
    if (result.rows.length !== 1 || row === undefined) {
      throw new Error("Daily delivery C1 legacy claim returned no exact row");
    }
    return mapReaderSummaryDailyBoundedMaintenanceClaimRow(row);
  });

const advanceC0Cursor = async (
  params: Readonly<{
    client: ReaderSummaryDailySqlClient;
    claim: ReaderSummaryDailyExecutionCursorClaim;
    invokedAt: string;
  }>,
): Promise<
  Readonly<{ nextUnresolvedUtcDate: string; eligibleThrough: string }>
> =>
  params.client.serializable(async (transaction) => {
    await transaction.query(
      `SELECT
        set_config('social_monitor.tenant_id', $1::UUID::TEXT, true),
        set_config('social_monitor.workspace_id', $2::UUID::TEXT, true),
        set_config('social_monitor.system_access', 'false', true),
        set_config('social_monitor.daily_delivery_c1_mode', 'exact', true)`,
      [params.claim.tenantId, params.claim.workspaceId],
    );
    const result = await transaction.query<{
      nextUnresolvedUtcDate: string;
      eligibleThrough: string;
    }>(
      `SELECT next_unresolved_utc_date::TEXT AS "nextUnresolvedUtcDate",
        eligible_through::TEXT AS "eligibleThrough"
       FROM public."advance_reader_summary_daily_delivery_c1_cursor"(
         $1::UUID, $2::UUID, $3::DATE, $4::TIMESTAMPTZ
       )`,
      [
        params.claim.tenantId,
        params.claim.workspaceId,
        params.claim.firstUnresolvedUtcDate,
        params.invokedAt,
      ],
    );
    const row = result.rows[0];
    if (result.rows.length !== 1 || row === undefined) {
      throw new Error(
        "Daily delivery C1 cursor transition returned no exact row",
      );
    }
    return row;
  });

const assertC1Claim = (
  params: Readonly<{
    claim: ReaderSummaryDailyExecutionCursorClaim;
    mode: string | undefined;
    recoveryThrough: string;
  }>,
): void => {
  if (params.mode !== readerSummaryDailyDeliveryC1Mode) {
    throw new Error("Daily delivery C1 cursor requires exact mode");
  }
  if (
    params.claim.firstUnresolvedUtcDate !==
    readerSummaryDailyDeliveryC1FirstDate
  ) {
    throw new Error("Daily delivery C1 cursor must begin at Jul23");
  }
  if (
    params.claim.tenantId !== "00000000-0000-7000-8000-000000000901" ||
    params.claim.workspaceId !== "00000000-0000-7000-8000-000000000902"
  ) {
    throw new Error("Daily delivery C1 cursor scope is invalid");
  }
  requireUtcDate(params.recoveryThrough, "recovery-through date");
};

const assertFrozenInvokedAt = (
  invokedAt: string,
  recoveryThrough: string,
): void => {
  const value = new Date(invokedAt);
  if (Number.isNaN(value.getTime())) {
    throw new Error("Daily delivery C1 invokedAt is invalid");
  }
  const eligibleThrough = new Date(value.getTime() - 86_400_000)
    .toISOString()
    .slice(0, 10);
  if (eligibleThrough !== recoveryThrough) {
    throw new Error(
      "Daily delivery C1 invokedAt does not match recovery-through",
    );
  }
};

const assertC1ClaimResult = (
  result: ReaderSummaryDailyClaimResult,
  recoveryThrough: string,
  boundary: "exact" | "bounded",
): ReaderSummaryDailyClaimResult => {
  if (result.kind === "claimed") {
    requireUtcDate(result.work.requestedUtcDate, "claimed date");
    requireUtcDate(result.work.eligibleThrough, "claim eligible-through");
    if (result.work.requestedUtcDate > recoveryThrough) {
      throw new Error("Daily delivery C1 claimed beyond recovery-through");
    }
    if (
      (boundary === "exact" &&
        result.work.eligibleThrough !== recoveryThrough) ||
      result.work.eligibleThrough > recoveryThrough
    ) {
      throw new Error("Daily delivery C1 claim eligible-through mismatched");
    }
    return result;
  }
  if (result.kind === "caught_up" || result.kind === "recovery_required") {
    assertExactEligibleThrough(result.eligibleThrough, recoveryThrough);
  }
  const resultDate =
    result.kind === "recovery_required"
      ? result.nextUnresolvedUtcDate
      : result.kind === "leased" || result.kind === "failed_ambiguous"
        ? result.requestedUtcDate
        : undefined;
  if (resultDate !== undefined) {
    requireUtcDate(resultDate, "result date");
    if (resultDate > recoveryThrough) {
      throw new Error("Daily delivery C1 result date exceeds recovery-through");
    }
  }
  return result;
};

const assertExactEligibleThrough = (actual: string, expected: string): void => {
  requireUtcDate(actual, "eligible-through");
  if (actual !== expected) {
    throw new Error("Daily delivery C1 eligible-through mismatched");
  }
};

const assertCursorPosition = (
  nextUnresolvedUtcDate: string,
  recoveryThrough: string,
): void => {
  requireUtcDate(nextUnresolvedUtcDate, "cursor date");
  if (nextUnresolvedUtcDate > addUtcDay(recoveryThrough)) {
    throw new Error("Daily delivery C1 cursor exceeds recovery-through fence");
  }
};

const addUtcDay = (value: string): string =>
  new Date(Date.parse(`${value}T00:00:00.000Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);

const requireUtcDate = (value: string, label: string): void => {
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`Daily delivery C1 ${label} is invalid`);
  }
};
