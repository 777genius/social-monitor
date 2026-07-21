import { createHash } from "node:crypto";

import { evaluateXAccountHealth } from "./x-account-pool-health";

export type XAccountAttributionStatus = "known" | "partial" | "unknown";

export type XAccountUsageEventRow = {
  readonly event_id?: string;
  readonly event_type?: string;
  readonly occurred_at?: string;
  readonly request_id?: string | null;
  readonly scan_job_id?: string | null;
  readonly collector_run_id?: string | null;
  readonly pass_observation_id?: string | null;
  readonly observation_relation?: string | null;
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

type NormalizedPassResults = {
  readonly events: readonly XAccountUsageEventRow[];
  readonly ambiguousPassObservationCount: number;
};

type StateDeltaObservationStatus =
  | "unavailable"
  | "monotonic_lower_bound"
  | "ambiguous";

type StateDeltaMetrics = {
  readonly requestDelta: number | null;
  readonly tweetDelta: number | null;
  readonly stateDeltaObservationStatus: StateDeltaObservationStatus;
  readonly stateDeltaBasis: typeof monotonicStateDeltaBasis | null;
  readonly ambiguousStateDeltaObservationCount: number;
};

type AccountMetrics = {
  readonly [Key in keyof TargetWindowMetrics]: number | null;
} & StateDeltaMetrics;

const passWindowOverlapRelation = "overlaps_pass_observation_window";
const monotonicStateDeltaBasis = "non_overlapping_counter_range_envelope";

const zeroOutputWarning =
  "eligible_account_requests_without_attributable_output";

export function xAccountAttributionStatus(
  events: readonly XAccountUsageEventRow[],
): XAccountAttributionStatus {
  return attributionStatusFor(normalizePassResults(events));
}

function attributionStatusFor(
  results: NormalizedPassResults,
): XAccountAttributionStatus {
  const knownCount = results.events.filter(isKnownAttributionEvent).length;
  if (results.events.length === 0 || knownCount === 0) {
    return "unknown";
  }

  if (results.ambiguousPassObservationCount > 0) {
    return "partial";
  }

  return knownCount === results.events.length ? "known" : "partial";
}

function normalizePassResults(
  events: readonly XAccountUsageEventRow[],
): NormalizedPassResults {
  // Correlated retries are idempotent only when every terminal field agrees.
  // A conflicting group contributes no pass or output metrics and is surfaced
  // through ambiguousPassObservationCount.
  const normalized: XAccountUsageEventRow[] = [];
  const correlated = new Map<string, XAccountUsageEventRow[]>();

  for (const event of events.filter(isPassResultEvent)) {
    const passId = normalizedPassObservationId(event);
    if (passId === undefined) {
      normalized.push(event);
      continue;
    }

    const group = correlated.get(passId) ?? [];
    group.push(event);
    correlated.set(passId, group);
  }

  let ambiguousPassObservationCount = 0;
  for (const group of correlated.values()) {
    const signatures = new Set(group.map(passResultSignature));
    if (signatures.size === 1) {
      normalized.push(group[0] as XAccountUsageEventRow);
    } else {
      ambiguousPassObservationCount += 1;
    }
  }

  return { events: normalized, ambiguousPassObservationCount };
}

function passResultSignature(event: XAccountUsageEventRow): string {
  return JSON.stringify([
    event.event_type ?? null,
    event.account_id ?? null,
    event.username?.trim() || null,
    event.attribution_status ?? null,
    finiteNumberOrNull(event.requests_before),
    finiteNumberOrNull(event.requests_after),
    finiteNumberOrNull(event.tweets_before),
    finiteNumberOrNull(event.tweets_after),
    finiteNumberOrNull(event.fetched_count),
    finiteNumberOrNull(event.accepted_count),
    finiteNumberOrNull(event.returned_count),
    event.failure_kind ?? null,
    event.cooldown_reason ?? null,
    event.reset_at ?? null,
  ]);
}

function finiteNumberOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function buildXAccountAttributionSummary(params: {
  readonly collectionDate: string;
  readonly events: readonly XAccountUsageEventRow[];
  readonly accounts: readonly ReturnType<typeof buildXAccountReport>[];
  readonly globalCollectionSucceeded: boolean;
}) {
  const passResults = normalizePassResults(params.events);
  const knownEvents = passResults.events.filter(isKnownAttributionEvent);
  const status = attributionStatusFor(passResults);
  const metrics = {
    ...stateDeltaMetrics(params.events),
    ...aggregatePassMetrics(passResults.events),
  };
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
    unknownPassResultCount: passResults.events.length - knownEvents.length,
    terminalObservationStatus:
      passResults.ambiguousPassObservationCount === 0
        ? "unambiguous"
        : "ambiguous",
    ambiguousPassObservationCount:
      passResults.ambiguousPassObservationCount,
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
  // Account status must never inherit a terminal observed for another
  // account. The global summary intentionally normalizes the full event set,
  // while this report is strictly account-local.
  const passResults = normalizePassResults(params.events);
  const attributionStatus = attributionStatusFor(passResults);
  const accountEventSet = new Set(params.events);
  const knownEvents = passResults.events.filter(
    (event) => accountEventSet.has(event) && isKnownAttributionEvent(event),
  );
  const metrics = accountMetrics(params.events, knownEvents);
  const rateLimits = summarizeXRateLimitObservations(params.events);
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
    terminalObservationStatus:
      passResults.ambiguousPassObservationCount === 0
        ? "unambiguous"
        : "ambiguous",
    ambiguousPassObservationCount:
      passResults.ambiguousPassObservationCount,
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
      terminalObservationStatus:
        passResults.ambiguousPassObservationCount === 0
          ? "unambiguous"
          : "ambiguous",
      ambiguousPassObservationCount:
        passResults.ambiguousPassObservationCount,
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
    rateLimitCount: rateLimits.count,
    rateLimitObservationStatus: rateLimits.status,
    ambiguousLegacyRateLimitEventCount:
      rateLimits.ambiguousLegacyEventCount,
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

function aggregatePassMetrics(
  resultEvents: readonly XAccountUsageEventRow[],
): Pick<
  { readonly [Key in keyof TargetWindowMetrics]: number | null },
  | "fetchedCount"
  | "acceptedCount"
  | "returnedCount"
  | "passSucceededCount"
  | "passFailedCount"
> {
  if (resultEvents.length === 0) {
    return {
      fetchedCount: null,
      acceptedCount: null,
      returnedCount: null,
      passSucceededCount: null,
      passFailedCount: null,
    };
  }

  return {
    fetchedCount: sumEventNumbers(
      resultEvents,
      (event) => event.fetched_count,
    ),
    acceptedCount: sumEventNumbers(
      resultEvents,
      (event) => event.accepted_count,
    ),
    returnedCount: sumEventNumbersOrNull(
      resultEvents,
      (event) => event.returned_count,
    ),
    passSucceededCount: countEvents(resultEvents, "pass_succeeded"),
    passFailedCount: countEvents(resultEvents, "pass_failed"),
  };
}

function accountMetrics(
  accountEvents: readonly XAccountUsageEventRow[],
  knownResultEvents: readonly XAccountUsageEventRow[],
): AccountMetrics {
  const stateMetrics = stateDeltaMetrics(accountEvents);
  if (knownResultEvents.length === 0) {
    return {
      ...stateMetrics,
      fetchedCount: null,
      acceptedCount: null,
      returnedCount: null,
      passSucceededCount: null,
      passFailedCount: null,
    };
  }

  return {
    ...stateMetrics,
    fetchedCount: sumEventNumbers(
      knownResultEvents,
      (event) => event.fetched_count,
    ),
    acceptedCount: sumEventNumbers(
      knownResultEvents,
      (event) => event.accepted_count,
    ),
    returnedCount: sumEventNumbersOrNull(
      knownResultEvents,
      (event) => event.returned_count,
    ),
    passSucceededCount: countEvents(knownResultEvents, "pass_succeeded"),
    passFailedCount: countEvents(knownResultEvents, "pass_failed"),
  };
}

function stateDeltaMetrics(
  events: readonly XAccountUsageEventRow[],
): StateDeltaMetrics {
  // These intervals describe shared account state observed around passes, not
  // pass causality. Merging overlapping counter ranges per account produces a
  // conservative monotonic lower bound without summing the same increment.
  const candidates = stateDeltaEvidenceEvents(events);
  if (candidates.length === 0) {
    return unavailableStateDeltaMetrics();
  }

  const canonicalIdentity = stateDeltaIdentityResolver(candidates);
  const observations: {
    readonly identity: string;
    readonly requestRange: readonly [number, number];
    readonly tweetRange: readonly [number, number];
  }[] = [];
  let ambiguousStateDeltaObservationCount = 0;

  for (const event of candidates) {
    const identity = canonicalIdentity(event);
    const requestRange = counterRange(
      event.requests_before,
      event.requests_after,
    );
    const tweetRange = counterRange(event.tweets_before, event.tweets_after);
    if (
      identity === undefined ||
      !hasValidStateDeltaRelation(event) ||
      requestRange === undefined ||
      tweetRange === undefined
    ) {
      ambiguousStateDeltaObservationCount += 1;
      continue;
    }

    if (
      requestRange[0] === requestRange[1] &&
      tweetRange[0] === tweetRange[1]
    ) {
      continue;
    }

    observations.push({ identity, requestRange, tweetRange });
  }

  if (ambiguousStateDeltaObservationCount > 0) {
    return {
      requestDelta: null,
      tweetDelta: null,
      stateDeltaObservationStatus: "ambiguous",
      stateDeltaBasis: null,
      ambiguousStateDeltaObservationCount,
    };
  }
  if (observations.length === 0) {
    return unavailableStateDeltaMetrics();
  }

  return {
    requestDelta: nonOverlappingCounterDelta(
      observations,
      (observation) => observation.requestRange,
    ),
    tweetDelta: nonOverlappingCounterDelta(
      observations,
      (observation) => observation.tweetRange,
    ),
    stateDeltaObservationStatus: "monotonic_lower_bound",
    stateDeltaBasis: monotonicStateDeltaBasis,
    ambiguousStateDeltaObservationCount: 0,
  };
}

function stateDeltaEvidenceEvents(
  events: readonly XAccountUsageEventRow[],
): readonly XAccountUsageEventRow[] {
  const stateObservations = events.filter(
    (event) =>
      event.event_type === "account_state_delta_observed" ||
      event.event_type === "account_contributed",
  );
  const observedPasses = new Set(
    stateObservations
      .map(normalizedPassObservationId)
      .filter((value): value is string => value !== undefined),
  );
  const legacyKnownResults = normalizePassResults(events).events.filter((event) => {
    if (!isKnownAttributionEvent(event)) {
      return false;
    }

    const passId = normalizedPassObservationId(event);
    return passId === undefined || !observedPasses.has(passId);
  });

  return [...stateObservations, ...legacyKnownResults];
}

function unavailableStateDeltaMetrics(): StateDeltaMetrics {
  return {
    requestDelta: null,
    tweetDelta: null,
    stateDeltaObservationStatus: "unavailable",
    stateDeltaBasis: null,
    ambiguousStateDeltaObservationCount: 0,
  };
}

function stateDeltaIdentityResolver(
  events: readonly XAccountUsageEventRow[],
): (event: XAccountUsageEventRow) => string | undefined {
  const idsByUsername = new Map<string, Set<number>>();
  const hasIdentifiedAccount = events.some(
    (event) => event.account_id !== undefined && event.account_id !== null,
  );
  for (const event of events) {
    const username = normalizedUsername(event);
    if (username === undefined || event.account_id === undefined || event.account_id === null) {
      continue;
    }
    const ids = idsByUsername.get(username) ?? new Set<number>();
    ids.add(event.account_id);
    idsByUsername.set(username, ids);
  }

  return (event) => {
    if (event.account_id !== undefined && event.account_id !== null) {
      return `id:${event.account_id}`;
    }
    const username = normalizedUsername(event);
    if (username === undefined) {
      return undefined;
    }
    const ids = idsByUsername.get(username);
    if (ids === undefined) {
      return hasIdentifiedAccount ? undefined : `username:${username}`;
    }
    return ids.size === 1 ? `id:${[...ids][0]}` : undefined;
  };
}

function hasValidStateDeltaRelation(event: XAccountUsageEventRow): boolean {
  if (isKnownAttributionEvent(event)) {
    return true;
  }
  const passId = normalizedPassObservationId(event);
  if (event.event_type === "account_state_delta_observed") {
    return (
      passId !== undefined &&
      event.observation_relation === passWindowOverlapRelation
    );
  }

  return (
    event.event_type === "account_contributed" &&
    event.attribution_status === "known" &&
    passId !== undefined
  );
}

function normalizedUsername(
  event: XAccountUsageEventRow,
): string | undefined {
  const username = event.username?.trim().toLowerCase();
  return username === undefined || username.length === 0 ? undefined : username;
}

function counterRange(
  before: number | null | undefined,
  after: number | null | undefined,
): readonly [number, number] | undefined {
  if (
    typeof before !== "number" ||
    typeof after !== "number" ||
    !Number.isSafeInteger(before) ||
    !Number.isSafeInteger(after) ||
    before < 0 ||
    after < before
  ) {
    return undefined;
  }

  return [before, after];
}

function nonOverlappingCounterDelta<TObservation extends { readonly identity: string }>(
  observations: readonly TObservation[],
  rangeOf: (observation: TObservation) => readonly [number, number],
): number {
  const rangesByIdentity = new Map<string, (readonly [number, number])[]>();
  for (const observation of observations) {
    const ranges = rangesByIdentity.get(observation.identity) ?? [];
    ranges.push(rangeOf(observation));
    rangesByIdentity.set(observation.identity, ranges);
  }

  let total = 0;
  for (const ranges of rangesByIdentity.values()) {
    const ordered = [...ranges].sort(
      ([leftStart, leftEnd], [rightStart, rightEnd]) =>
        leftStart - rightStart || leftEnd - rightEnd,
    );
    let [rangeStart, rangeEnd] = ordered[0] as readonly [number, number];
    for (const [nextStart, nextEnd] of ordered.slice(1)) {
      if (nextStart > rangeEnd) {
        total += rangeEnd - rangeStart;
        rangeStart = nextStart;
        rangeEnd = nextEnd;
      } else {
        rangeEnd = Math.max(rangeEnd, nextEnd);
      }
    }
    total += rangeEnd - rangeStart;
  }

  return total;
}

function normalizedPassObservationId(
  event: XAccountUsageEventRow,
): string | undefined {
  const value = event.pass_observation_id?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
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

export function countXRateLimitObservations(
  events: readonly XAccountUsageEventRow[],
): number {
  return summarizeXRateLimitObservations(events).count;
}

export function summarizeXRateLimitObservations(
  events: readonly XAccountUsageEventRow[],
): {
  readonly count: number;
  readonly status: "unambiguous" | "ambiguous_legacy_uncorrelated";
  readonly ambiguousLegacyEventCount: number;
} {
  const correlatedObservations = new Set<string>();
  let ambiguousLegacyEventCount = 0;
  events.forEach((event) => {
    if (
      !isRateLimitEvent(event) ||
      (!isPassResultEvent(event) && event.event_type !== "cooldown_observed")
    ) {
      return;
    }

    const passId = normalizedPassObservationId(event);
    if (passId === undefined) {
      ambiguousLegacyEventCount += 1;
    } else {
      correlatedObservations.add(passId);
    }
  });

  return {
    // Uncorrelated legacy rows may describe the same failure and cooldown.
    // Keep a lower bound of one without adding it to correlated observations.
    count:
      correlatedObservations.size > 0
        ? correlatedObservations.size
        : ambiguousLegacyEventCount > 0
          ? 1
          : 0,
    status:
      ambiguousLegacyEventCount > 0
        ? "ambiguous_legacy_uncorrelated"
        : "unambiguous",
    ambiguousLegacyEventCount,
  };
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

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}
