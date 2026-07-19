import { createHash } from "node:crypto";

import { evaluateXAccountHealth } from "./x-account-pool-health";

export type XAccountAttributionStatus = "known" | "partial" | "unknown";

export type XAccountUsageEventRow = {
  readonly event_id?: string;
  readonly event_type?: string;
  readonly occurred_at?: string;
  readonly account_id?: number | null;
  readonly username?: string | null;
  readonly estimated_request_cost?: number | null;
  readonly daily_requests_limit?: number | null;
  readonly daily_tweets_limit?: number | null;
  readonly account_priority?: number | null;
  readonly requests_before?: number | null;
  readonly requests_after?: number | null;
  readonly tweets_before?: number | null;
  readonly tweets_after?: number | null;
  readonly fetched_count?: number | null;
  readonly accepted_count?: number | null;
  readonly returned_count?: number | null;
  readonly failure_kind?: string | null;
  readonly cooldown_reason?: string | null;
  readonly reset_at?: string | null;
  readonly attribution_status?: string | null;
};

export type XAccountStateRow = {
  readonly id?: number;
  readonly username?: string;
  readonly status?: number;
  readonly daily_requests?: number;
  readonly daily_tweets?: number;
  readonly last_reset_date?: string | null;
  readonly available_until?: string | null;
  readonly last_used_at?: string | null;
  readonly cooldown_reason?: string | null;
  readonly busy?: number;
};

type TargetWindowMetrics = {
  readonly requestDelta: number;
  readonly tweetDelta: number;
  readonly fetchedCount: number;
  readonly acceptedCount: number;
  readonly returnedCount: number;
  readonly passSucceededCount: number;
  readonly passFailedCount: number;
};

const zeroOutputWarning =
  "eligible_account_requests_without_attributable_output";

export function xAccountAttributionStatus(
  events: readonly XAccountUsageEventRow[],
): XAccountAttributionStatus {
  const results = events.filter(isPassResultEvent);
  const knownCount = results.filter(isKnownAttributionEvent).length;
  if (results.length === 0 || knownCount === 0) {
    return "unknown";
  }

  return knownCount === results.length ? "known" : "partial";
}

export function buildXAccountAttributionSummary(params: {
  readonly collectionDate: string;
  readonly events: readonly XAccountUsageEventRow[];
  readonly accounts: readonly ReturnType<typeof buildXAccountReport>[];
  readonly globalCollectionSucceeded: boolean;
}) {
  const resultEvents = params.events.filter(isPassResultEvent);
  const knownEvents = resultEvents.filter(isKnownAttributionEvent);
  const status = xAccountAttributionStatus(params.events);
  const metrics = metricsForAttribution(status, knownEvents);
  const warnings = params.accounts.flatMap((account) =>
    account.warningCodes.map((code) => ({
      code,
      accountFingerprint: account.accountFingerprint,
    })),
  );
  const gateReason = warningOnlyGateReason({
    status,
    warningCount: warnings.length,
    globalCollectionSucceeded: params.globalCollectionSucceeded,
  });

  return {
    collectionDate: params.collectionDate,
    status,
    knownPassResultCount: knownEvents.length,
    unknownPassResultCount: resultEvents.length - knownEvents.length,
    ...metrics,
    eligibleAccountZeroAttributableOutputWarningCount: warnings.length,
    warnings,
    attributionPolicy: "warning_only",
    gateReason,
  } as const;
}

export function buildXAccountReport(params: {
  readonly accountKey: string;
  readonly state: XAccountStateRow | undefined;
  readonly events: readonly XAccountUsageEventRow[];
  readonly allEvents: readonly XAccountUsageEventRow[];
  readonly collectionDate: string;
  readonly observedAt: Date;
}) {
  const username = params.state?.username ?? params.events[0]?.username ?? "";
  const accountId = params.state?.id ?? params.events[0]?.account_id ?? null;
  const eventTimes = params.events
    .map((event) => event.occurred_at)
    .filter((value): value is string => value !== undefined);
  const latestEventAt = eventTimes.sort().at(-1) ?? null;
  const latestDailyRequestsLimit = latestNumber(
    params.events,
    (event) => event.daily_requests_limit,
  );
  const latestDailyTweetsLimit = latestNumber(
    params.events,
    (event) => event.daily_tweets_limit,
  );
  const latestAccountPriority = latestNumber(
    params.events,
    (event) => event.account_priority,
  );
  const status = params.state?.status ?? null;
  const busy =
    params.state?.busy === undefined ? null : params.state.busy === 1;
  const dailyRequests = params.state?.daily_requests ?? null;
  const dailyTweets = params.state?.daily_tweets ?? null;
  const lastResetDate = params.state?.last_reset_date ?? null;
  const cooldownUntil = params.state?.available_until ?? null;
  const health = evaluateXAccountHealth(
    {
      stateAvailable: params.state !== undefined,
      status,
      busy,
      dailyRequests,
      dailyTweets,
      dailyRequestsLimit: latestDailyRequestsLimit,
      dailyTweetsLimit: latestDailyTweetsLimit,
      lastResetDate,
      cooldownUntil,
    },
    params.observedAt,
  );
  const attributionStatus = xAccountAttributionStatus(params.allEvents);
  const knownEvents = params.events.filter(isKnownAttributionEvent);
  const metrics = metricsForAttribution(attributionStatus, knownEvents);
  const warningCodes =
    health.eligible &&
    attributionStatus === "known" &&
    metrics.requestDelta !== null &&
    metrics.requestDelta > 0 &&
    metrics.acceptedCount === 0
      ? [zeroOutputWarning]
      : [];
  const accountFingerprint = fingerprint(
    `x-account:${accountId ?? params.accountKey}`,
  );

  return {
    accountFingerprint,
    usernameFingerprint:
      username.trim().length === 0 ? null : fingerprint(`x-user:${username}`),
    priorityRank: latestAccountPriority ?? accountId ?? 9999,
    prioritySource:
      latestAccountPriority === null ? "account_order" : "account_profile",
    ...health,
    status,
    busy,
    dailyRequests,
    dailyTweets,
    dailyRequestsLimit: latestDailyRequestsLimit,
    dailyTweetsLimit: latestDailyTweetsLimit,
    lastResetDate,
    attributionStatus,
    observedAccountSnapshot: {
      observedAt: params.observedAt.toISOString(),
      dailyRequests,
      dailyTweets,
      counterResetDate: lastResetDate,
      counterResetDateMatchesTargetDate:
        lastResetDate === params.collectionDate,
    },
    targetWindowAttribution: {
      collectionDate: params.collectionDate,
      status: attributionStatus,
      ...metrics,
    },
    lastUsedAt: params.state?.last_used_at ?? latestEventAt,
    latestEventAt,
    cooldownUntil,
    cooldownReasonFingerprint:
      params.state?.cooldown_reason === null ||
      params.state?.cooldown_reason === undefined
        ? null
        : fingerprint(params.state.cooldown_reason),
    eventCount: params.events.length,
    passStartedCount: countEvents(params.events, "pass_started"),
    passSucceededCount: metrics.passSucceededCount,
    passFailedCount: metrics.passFailedCount,
    cooldownObservedCount: countEvents(params.events, "cooldown_observed"),
    rateLimitCount: params.events.filter(isRateLimitEvent).length,
    estimatedRequestCost: sumEventNumbers(
      params.events,
      (event) => event.estimated_request_cost,
    ),
    requestDelta: metrics.requestDelta,
    tweetDelta: metrics.tweetDelta,
    fetchedCount: metrics.fetchedCount,
    acceptedCount: metrics.acceptedCount,
    returnedCount: metrics.returnedCount,
    warningCodes,
  } as const;
}

function metricsForAttribution(
  status: XAccountAttributionStatus,
  events: readonly XAccountUsageEventRow[],
): { readonly [Key in keyof TargetWindowMetrics]: number | null } {
  if (status === "unknown") {
    return {
      requestDelta: null,
      tweetDelta: null,
      fetchedCount: null,
      acceptedCount: null,
      returnedCount: null,
      passSucceededCount: null,
      passFailedCount: null,
    };
  }

  return {
    requestDelta: sumEventNumbers(events, requestDelta),
    tweetDelta: sumEventNumbers(events, tweetDelta),
    fetchedCount: sumEventNumbers(events, (event) => event.fetched_count),
    acceptedCount: sumEventNumbers(events, (event) => event.accepted_count),
    returnedCount: sumEventNumbersOrNull(
      events,
      (event) => event.returned_count,
    ),
    passSucceededCount: countEvents(events, "pass_succeeded"),
    passFailedCount: countEvents(events, "pass_failed"),
  };
}

function warningOnlyGateReason(params: {
  readonly status: XAccountAttributionStatus;
  readonly warningCount: number;
  readonly globalCollectionSucceeded: boolean;
}): string {
  if (params.status === "known") {
    return params.warningCount === 0
      ? "known_attribution_healthy"
      : "known_attribution_zero_output_warning_only";
  }

  const collectionResult = params.globalCollectionSucceeded
    ? "global_collection_succeeded"
    : "without_global_success";
  return `${params.status}_attribution_${collectionResult}_warning_only`;
}

function isPassResultEvent(event: XAccountUsageEventRow): boolean {
  return (
    event.event_type === "pass_succeeded" || event.event_type === "pass_failed"
  );
}

function isKnownAttributionEvent(event: XAccountUsageEventRow): boolean {
  return (
    isPassResultEvent(event) &&
    event.attribution_status === "known" &&
    (event.account_id !== null && event.account_id !== undefined ||
      (event.username?.trim().length ?? 0) > 0)
  );
}

function countEvents(
  events: readonly XAccountUsageEventRow[],
  eventType: string,
): number {
  return events.filter((event) => event.event_type === eventType).length;
}

function isRateLimitEvent(event: XAccountUsageEventRow): boolean {
  const text = `${event.failure_kind ?? ""} ${event.cooldown_reason ?? ""}`
    .trim()
    .toLowerCase();

  return (
    text.includes("rate") ||
    text.includes("limit") ||
    text.includes("429") ||
    text.includes("cooldown")
  );
}

function sumEventNumbers(
  events: readonly XAccountUsageEventRow[],
  valueOf: (event: XAccountUsageEventRow) => number | null | undefined,
): number {
  return events.reduce((sum, event) => {
    const value = valueOf(event);
    return (
      sum + (typeof value === "number" && Number.isFinite(value) ? value : 0)
    );
  }, 0);
}

function sumEventNumbersOrNull(
  events: readonly XAccountUsageEventRow[],
  valueOf: (event: XAccountUsageEventRow) => number | null | undefined,
): number | null {
  const values = events
    .map(valueOf)
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    );

  return values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0);
}

function latestNumber(
  events: readonly XAccountUsageEventRow[],
  valueOf: (event: XAccountUsageEventRow) => number | null | undefined,
): number | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const value = valueOf(events[index] as XAccountUsageEventRow);
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function requestDelta(event: XAccountUsageEventRow): number {
  return counterDelta(event.requests_before, event.requests_after);
}

function tweetDelta(event: XAccountUsageEventRow): number {
  return counterDelta(event.tweets_before, event.tweets_after);
}

function counterDelta(
  before: number | null | undefined,
  after: number | null | undefined,
): number {
  if (
    typeof before !== "number" ||
    typeof after !== "number" ||
    !Number.isFinite(before) ||
    !Number.isFinite(after)
  ) {
    return 0;
  }

  return Math.max(after - before, 0);
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}
