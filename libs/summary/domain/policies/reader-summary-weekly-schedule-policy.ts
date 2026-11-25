import {
  assertReaderSummaryWeeklyDenseArray,
  assertReaderSummaryWeeklyExactObject,
  canonicalizeReaderSummaryWeeklyJson,
  deepFreezeReaderSummaryWeekly,
  exactReaderSummaryWeeklyIdentity,
  exactReaderSummaryWeeklyUtcDay,
} from "../value-objects/reader-summary-weekly-canonical-json";

export const readerSummaryWeeklyScheduleSlotSchemaVersion =
  "reader_summary.weekly_schedule_slot.v1" as const;

export const READER_SUMMARY_WEEKLY_MAX_CATCH_UP_SLOTS = 52;
export const READER_SUMMARY_WEEKLY_MAX_SLOT_STATES = 256;
export const READER_SUMMARY_WEEKLY_MAX_MODEL_ATTEMPTS = 3;
export const READER_SUMMARY_WEEKLY_RETRY_BACKOFF_MS = Object.freeze([
  60_000,
  300_000,
] as const);

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

export type ReaderSummaryWeeklyScheduleSlotCoordinates = Readonly<{
  tenantId: string;
  workspaceId: string;
  weekStartedUtcDate: string;
  weekEndedUtcDate: string;
}>;

export type ReaderSummaryWeeklyScheduleSlot =
  ReaderSummaryWeeklyScheduleSlotCoordinates &
    Readonly<{
      schemaVersion: typeof readerSummaryWeeklyScheduleSlotSchemaVersion;
      timezone: "UTC";
      identity: string;
      sha256: string;
    }>;

export type ReaderSummaryWeeklySlotState =
  | "completed"
  | "active"
  | "terminal";

export type ReaderSummaryWeeklySlotObservation = Readonly<{
  slot: ReaderSummaryWeeklyScheduleSlot;
  state: ReaderSummaryWeeklySlotState;
}>;

export type ReaderSummaryWeeklyCatchUpPlan = Readonly<{
  slots: readonly ReaderSummaryWeeklyScheduleSlot[];
  closedSlotCount: number;
  occupiedSlotCount: number;
  deferredSlotCount: number;
}>;

export type ReaderSummaryWeeklyFailureCategory =
  | "infrastructure"
  | "domain"
  | "schema"
  | "editorial"
  | "model_refusal";

export type ReaderSummaryWeeklyFailureClassification = Readonly<{
  category: ReaderSummaryWeeklyFailureCategory;
  retryable: boolean;
}>;

export type ReaderSummaryWeeklyRetryDecision =
  | Readonly<{
      decision: "retry";
      modelCall: "retry";
      nextAttemptNumber: number;
      backoffMs: number;
    }>
  | Readonly<{
      decision: "terminal";
      modelCall: "none";
      nextAttemptNumber: null;
      backoffMs: null;
      reason:
        | "failure_is_terminal"
        | "infrastructure_not_retryable"
        | "attempt_limit_reached";
    }>;

const slotCoordinateKeys = [
  "tenantId",
  "workspaceId",
  "weekStartedUtcDate",
  "weekEndedUtcDate",
] as const;
const slotKeys = [
  "schemaVersion",
  "tenantId",
  "workspaceId",
  "weekStartedUtcDate",
  "weekEndedUtcDate",
  "timezone",
  "identity",
  "sha256",
] as const;
const observationKeys = ["slot", "state"] as const;
const planKeys = [
  "tenantId",
  "workspaceId",
  "firstWeekStartedUtcDate",
  "now",
  "catchUpLimit",
  "observedSlots",
] as const;
const retryDecisionKeys = ["attemptNumber", "failure"] as const;
const failureKeys = ["category", "retryable"] as const;
const terminalFailureCategories = new Set<ReaderSummaryWeeklyFailureCategory>([
  "domain",
  "schema",
  "editorial",
  "model_refusal",
]);

export const deriveReaderSummaryWeeklyScheduleSlot = (
  input: ReaderSummaryWeeklyScheduleSlotCoordinates,
): ReaderSummaryWeeklyScheduleSlot => {
  assertReaderSummaryWeeklyExactObject(
    input,
    slotCoordinateKeys,
    "schedule slot coordinates",
  );
  const tenantId = exactReaderSummaryWeeklyIdentity(
    input.tenantId,
    "schedule tenant id",
  );
  const workspaceId = exactReaderSummaryWeeklyIdentity(
    input.workspaceId,
    "schedule workspace id",
  );
  const weekStartedUtcDate = exactMondayUtcDate(input.weekStartedUtcDate);
  const weekEndedUtcDate = exactReaderSummaryWeeklyUtcDay(
    input.weekEndedUtcDate,
  );
  if (
    weekEndedUtcDate !==
    utcDateFromTimestamp(utcDateTimestamp(weekStartedUtcDate) + 6 * DAY_MS)
  ) {
    throw new Error(
      "Reader summary weekly schedule slot must cover Monday through Sunday",
    );
  }

  const body = deepFreezeReaderSummaryWeekly({
    schemaVersion: readerSummaryWeeklyScheduleSlotSchemaVersion,
    tenantId,
    workspaceId,
    weekStartedUtcDate,
    weekEndedUtcDate,
    timezone: "UTC" as const,
  });
  const canonical = canonicalizeReaderSummaryWeeklyJson(
    body,
    "schedule slot identity",
  );

  return deepFreezeReaderSummaryWeekly({
    ...body,
    identity: `${readerSummaryWeeklyScheduleSlotSchemaVersion}:${canonical.sha256}`,
    sha256: canonical.sha256,
  });
};

export function assertReaderSummaryWeeklyScheduleSlot(
  input: unknown,
): asserts input is ReaderSummaryWeeklyScheduleSlot {
  assertReaderSummaryWeeklyExactObject(
    input,
    slotKeys,
    "schedule slot",
    { allowAuthoritativeHashes: true },
  );
  const slot = input as ReaderSummaryWeeklyScheduleSlot;
  const expected = deriveReaderSummaryWeeklyScheduleSlot({
    tenantId: slot.tenantId,
    workspaceId: slot.workspaceId,
    weekStartedUtcDate: slot.weekStartedUtcDate,
    weekEndedUtcDate: slot.weekEndedUtcDate,
  });
  if (
    slot.schemaVersion !== expected.schemaVersion ||
    slot.timezone !== "UTC" ||
    slot.identity !== expected.identity ||
    slot.sha256 !== expected.sha256
  ) {
    throw new Error(
      "Reader summary weekly schedule slot identity binding diverged",
    );
  }
}

export const planReaderSummaryWeeklyCatchUp = (params: {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly firstWeekStartedUtcDate: string;
  readonly now: Date;
  readonly catchUpLimit: number;
  readonly observedSlots: readonly ReaderSummaryWeeklySlotObservation[];
}): ReaderSummaryWeeklyCatchUpPlan => {
  assertReaderSummaryWeeklyExactObject(
    params,
    planKeys,
    "schedule planning input",
  );
  const tenantId = exactReaderSummaryWeeklyIdentity(
    params.tenantId,
    "schedule tenant id",
  );
  const workspaceId = exactReaderSummaryWeeklyIdentity(
    params.workspaceId,
    "schedule workspace id",
  );
  const firstWeekStartedUtcDate = exactMondayUtcDate(
    params.firstWeekStartedUtcDate,
  );
  const nowTimestamp = exactDateTimestamp(params.now, "schedule now");
  assertCatchUpLimit(params.catchUpLimit);
  assertReaderSummaryWeeklyDenseArray(
    params.observedSlots,
    "schedule observed slots",
  );
  if (
    params.observedSlots.length >
    READER_SUMMARY_WEEKLY_MAX_SLOT_STATES
  ) {
    throw new Error("Reader summary weekly schedule state exceeds hard bound");
  }

  const firstWeekTimestamp = utcDateTimestamp(firstWeekStartedUtcDate);
  const currentWeekTimestamp = currentUtcWeekTimestamp(nowTimestamp);
  const closedSlotCount = Math.max(
    0,
    Math.floor((currentWeekTimestamp - firstWeekTimestamp) / WEEK_MS),
  );
  const occupiedIdentities = validatedOccupiedIdentities({
    observedSlots: params.observedSlots,
    tenantId,
    workspaceId,
    firstWeekTimestamp,
    currentWeekTimestamp,
  });
  const slots: ReaderSummaryWeeklyScheduleSlot[] = [];

  for (
    let index = 0;
    index < closedSlotCount && slots.length < params.catchUpLimit;
    index += 1
  ) {
    const weekStartedTimestamp = firstWeekTimestamp + index * WEEK_MS;
    const slot = deriveReaderSummaryWeeklyScheduleSlot({
      tenantId,
      workspaceId,
      weekStartedUtcDate: utcDateFromTimestamp(weekStartedTimestamp),
      weekEndedUtcDate: utcDateFromTimestamp(
        weekStartedTimestamp + 6 * DAY_MS,
      ),
    });
    if (!occupiedIdentities.has(slot.identity)) {
      slots.push(slot);
    }
  }

  return deepFreezeReaderSummaryWeekly({
    slots,
    closedSlotCount,
    occupiedSlotCount: occupiedIdentities.size,
    deferredSlotCount:
      closedSlotCount - occupiedIdentities.size - slots.length,
  });
};

export const decideReaderSummaryWeeklyRetry = (params: {
  readonly attemptNumber: number;
  readonly failure: ReaderSummaryWeeklyFailureClassification;
}): ReaderSummaryWeeklyRetryDecision => {
  assertReaderSummaryWeeklyExactObject(
    params,
    retryDecisionKeys,
    "retry decision input",
  );
  assertReaderSummaryWeeklyExactObject(
    params.failure,
    failureKeys,
    "retry failure classification",
  );
  if (
    !Number.isInteger(params.attemptNumber) ||
    params.attemptNumber < 1 ||
    params.attemptNumber > READER_SUMMARY_WEEKLY_MAX_MODEL_ATTEMPTS
  ) {
    throw new Error(
      "Reader summary weekly attempt number is outside the hard bound",
    );
  }
  if (
    params.failure.category !== "infrastructure" &&
    !terminalFailureCategories.has(params.failure.category)
  ) {
    throw new Error(
      "Reader summary weekly failure classification is invalid",
    );
  }
  if (typeof params.failure.retryable !== "boolean") {
    throw new Error(
      "Reader summary weekly retryability classification is invalid",
    );
  }
  if (terminalFailureCategories.has(params.failure.category)) {
    return terminalRetryDecision("failure_is_terminal");
  }
  if (!params.failure.retryable) {
    return terminalRetryDecision("infrastructure_not_retryable");
  }
  if (params.attemptNumber === READER_SUMMARY_WEEKLY_MAX_MODEL_ATTEMPTS) {
    return terminalRetryDecision("attempt_limit_reached");
  }
  const backoffMs =
    READER_SUMMARY_WEEKLY_RETRY_BACKOFF_MS[params.attemptNumber - 1];
  if (backoffMs === undefined) {
    throw new Error("Reader summary weekly retry backoff is unavailable");
  }

  return deepFreezeReaderSummaryWeekly({
    decision: "retry" as const,
    modelCall: "retry" as const,
    nextAttemptNumber: params.attemptNumber + 1,
    backoffMs,
  });
};

const validatedOccupiedIdentities = (params: {
  readonly observedSlots: readonly ReaderSummaryWeeklySlotObservation[];
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly firstWeekTimestamp: number;
  readonly currentWeekTimestamp: number;
}): ReadonlySet<string> => {
  const identities = new Set<string>();
  for (const observation of params.observedSlots) {
    assertReaderSummaryWeeklyExactObject(
      observation,
      observationKeys,
      "schedule slot observation",
    );
    assertReaderSummaryWeeklyScheduleSlot(observation.slot);
    if (
      observation.state !== "completed" &&
      observation.state !== "active" &&
      observation.state !== "terminal"
    ) {
      throw new Error("Reader summary weekly schedule slot state is invalid");
    }
    const slotTimestamp = utcDateTimestamp(
      observation.slot.weekStartedUtcDate,
    );
    if (
      observation.slot.tenantId !== params.tenantId ||
      observation.slot.workspaceId !== params.workspaceId ||
      slotTimestamp < params.firstWeekTimestamp ||
      slotTimestamp >= params.currentWeekTimestamp
    ) {
      throw new Error(
        "Reader summary weekly schedule slot state diverges from planning scope",
      );
    }
    if (identities.has(observation.slot.identity)) {
      throw new Error(
        "Reader summary weekly schedule slot state contains duplicate identity",
      );
    }
    identities.add(observation.slot.identity);
  }
  return identities;
};

const exactMondayUtcDate = (value: unknown): string => {
  const day = exactReaderSummaryWeeklyUtcDay(value);
  if (new Date(`${day}T00:00:00.000Z`).getUTCDay() !== 1) {
    throw new Error("Reader summary weekly schedule slot must start on Monday");
  }
  return day;
};

const exactDateTimestamp = (value: unknown, label: string): number => {
  if (
    !(value instanceof Date) ||
    Object.getPrototypeOf(value) !== Date.prototype ||
    !Number.isFinite(value.getTime())
  ) {
    throw new Error(`Reader summary weekly ${label} must be a valid Date`);
  }
  return value.getTime();
};

const assertCatchUpLimit = (value: number): void => {
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > READER_SUMMARY_WEEKLY_MAX_CATCH_UP_SLOTS
  ) {
    throw new Error(
      "Reader summary weekly catch-up limit is outside the hard bound",
    );
  }
};

const currentUtcWeekTimestamp = (timestamp: number): number => {
  const value = new Date(timestamp);
  const utcDayTimestamp = Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
  );
  const daysSinceMonday = (value.getUTCDay() + 6) % 7;
  return utcDayTimestamp - daysSinceMonday * DAY_MS;
};

const utcDateTimestamp = (value: string): number =>
  Date.parse(`${value}T00:00:00.000Z`);

const utcDateFromTimestamp = (value: number): string =>
  new Date(value).toISOString().slice(0, 10);

const terminalRetryDecision = (
  reason: Extract<
    ReaderSummaryWeeklyRetryDecision,
    { readonly decision: "terminal" }
  >["reason"],
): ReaderSummaryWeeklyRetryDecision =>
  deepFreezeReaderSummaryWeekly({
    decision: "terminal" as const,
    modelCall: "none" as const,
    nextAttemptNumber: null,
    backoffMs: null,
    reason,
  });
