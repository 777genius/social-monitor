import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

type XRunRow = {
  readonly run_id?: string;
  readonly status?: string;
  readonly started_at?: string | null;
  readonly finished_at?: string | null;
  readonly tweets_count?: number;
  readonly query_hash?: string;
  readonly input_json?: string;
  readonly stats_json?: string;
};

type XRunInput = {
  readonly since?: string;
  readonly until?: string;
  readonly search_query?: string;
  readonly display_type?: string;
  readonly min_likes?: number | null;
  readonly min_retweets?: number | null;
  readonly min_replies?: number | null;
};

type XRunStats = {
  readonly tasks_failed?: number;
  readonly retries?: number;
};

type XCollectorJsonWarning = {
  readonly runId: string | null;
  readonly field: "input_json" | "stats_json";
  readonly reason: string;
};

type XAccountUsageEventRow = {
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
};

type XAccountStateRow = {
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

type BuildParams = {
  readonly ledgerPath: string;
  readonly collectionDate: string;
};

export type XCollectorLedgerReport = ReturnType<
  typeof buildXCollectorLedgerReport
>;
export type XAccountPoolReport = ReturnType<typeof buildXAccountPoolReport>;

export function buildXCollectorLedgerReport(params: BuildParams) {
  if (!existsSync(params.ledgerPath)) {
    return emptyXCollectorLedgerReport(false, "ledger_file_missing");
  }

  const rowsResult = readXRunRows(params.ledgerPath);
  if (!rowsResult.ok) {
    return emptyXCollectorLedgerReport(false, rowsResult.error);
  }

  const rows = rowsResult.rows.filter((row) =>
    runTargetsCollectionDate(row, params.collectionDate),
  );
  const queryHashes = new Set<string>();
  const displayTypeBreakdown = new Map<string, number>();
  const queryFamilyFingerprints = new Set<string>();
  const invalidJsonFields: XCollectorJsonWarning[] = [];
  let completedRunCount = 0;
  let failedRunCount = 0;
  let partialUsableRunCount = 0;
  let partialUsableReturnedTweetCount = 0;
  let hardFailedRunCount = 0;
  let nonTerminalOrUnknownRunCount = 0;
  let failedReturnedTweetCount = 0;
  let returnedTweetCount = 0;
  let strictEngagementRunCount = 0;
  let discoveryRunCount = 0;
  let orGroupRunCount = 0;
  let phraseQueryRunCount = 0;
  let taskFailureCount = 0;
  let retryCount = 0;

  for (const row of rows) {
    const inputResult = parseJsonField<XRunInput>(row, "input_json");
    const statsResult = parseJsonField<XRunStats>(row, "stats_json");
    if (!inputResult.ok) {
      invalidJsonFields.push(inputResult.warning);
    }
    if (!statsResult.ok) {
      invalidJsonFields.push(statsResult.warning);
    }

    const input = inputResult.ok ? inputResult.value : undefined;
    const stats = statsResult.ok ? statsResult.value : undefined;
    const displayType = input?.display_type ?? "unknown";
    const minLikes = input?.min_likes ?? 0;
    const minRetweets = input?.min_retweets ?? 0;
    const minReplies = input?.min_replies ?? 0;
    const query = input?.search_query ?? "";

    const tweetCount = normalizedTweetCount(row.tweets_count);
    if (row.status === "completed") {
      completedRunCount += 1;
    } else if (row.status === "failed") {
      failedRunCount += 1;
      failedReturnedTweetCount += tweetCount;
      if (tweetCount > 0) {
        partialUsableRunCount += 1;
        partialUsableReturnedTweetCount += tweetCount;
      } else {
        hardFailedRunCount += 1;
      }
    } else {
      nonTerminalOrUnknownRunCount += 1;
    }
    returnedTweetCount += tweetCount;
    if (row.query_hash !== undefined && row.query_hash.length > 0) {
      queryHashes.add(row.query_hash);
    }
    displayTypeBreakdown.set(
      displayType,
      (displayTypeBreakdown.get(displayType) ?? 0) + 1,
    );
    if (minLikes >= 50 || minRetweets >= 10 || minReplies >= 5) {
      strictEngagementRunCount += 1;
    }
    if (minLikes <= 5 && minRetweets <= 1 && minReplies <= 1) {
      discoveryRunCount += 1;
    }
    if (/\bOR\b/.test(query)) {
      orGroupRunCount += 1;
    }
    if (/"[^"]+"/.test(query)) {
      phraseQueryRunCount += 1;
    }
    if (query.trim().length > 0) {
      queryFamilyFingerprints.add(hashText(query).slice(0, 12));
    }
    taskFailureCount += stats?.tasks_failed ?? 0;
    retryCount += stats?.retries ?? 0;
  }

  return {
    available: true,
    runCount: rows.length,
    completedRunCount,
    failedRunCount,
    partialUsableRunCount,
    partialUsableReturnedTweetCount,
    hardFailedRunCount,
    nonTerminalOrUnknownRunCount,
    usableRunCount: completedRunCount + partialUsableRunCount,
    completedRunRate:
      rows.length === 0 ? 0 : roundMetric(completedRunCount / rows.length),
    usableRunRate:
      rows.length === 0
        ? 0
        : roundMetric(
            (completedRunCount + partialUsableRunCount) / rows.length,
          ),
    failedReturnedTweetCount,
    returnedTweetCount,
    distinctQueryHashCount: queryHashes.size,
    firstStartedAt: rows[0]?.started_at ?? null,
    lastStartedAt: rows.at(-1)?.started_at ?? null,
    displayTypeBreakdown: Object.fromEntries(
      [...displayTypeBreakdown.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
    strictEngagementRunCount,
    discoveryRunCount,
    orGroupRunCount,
    phraseQueryRunCount,
    taskFailureCount,
    retryCount,
    hasTopAndLatest:
      displayTypeBreakdown.has("Top") && displayTypeBreakdown.has("Latest"),
    hasStrictAndDiscoveryLanes:
      strictEngagementRunCount > 0 && discoveryRunCount > 0,
    invalidJsonFieldCount: invalidJsonFields.length,
    invalidJsonFields: invalidJsonFields.slice(0, 20),
    readError: null,
    queryFamilyFingerprints: [...queryFamilyFingerprints].sort(),
  } as const;
}

export function buildXAccountPoolReport(params: BuildParams) {
  if (!existsSync(params.ledgerPath)) {
    return emptyXAccountPoolReport(false, "ledger_file_missing");
  }

  const stateResult = readXAccountStateRows(params.ledgerPath);
  if (!stateResult.ok) {
    return emptyXAccountPoolReport(false, stateResult.error);
  }

  const eventResult = readXAccountUsageEventRows(params);
  if (!eventResult.ok) {
    return emptyXAccountPoolReport(true, eventResult.error, stateResult.rows);
  }

  const events = eventResult.rows;
  const stateByAccount = new Map(
    stateResult.rows.map((row) => [
      accountBucketKey(row.id, row.username),
      row,
    ]),
  );
  const stateKeyByUsername = new Map(
    stateResult.rows
      .map((row) => [
        row.username?.trim(),
        accountBucketKey(row.id, row.username),
      ])
      .filter((entry): entry is [string, string] =>
        Boolean(entry[0] !== undefined && entry[0].length > 0),
      ),
  );
  const eventsByAccount = groupBy(
    events.filter((event) => eventAccountBucketKey(event, stateKeyByUsername)),
    (event) => eventAccountBucketKey(event, stateKeyByUsername) as string,
  );
  const accountKeys = new Set([
    ...stateByAccount.keys(),
    ...eventsByAccount.keys(),
  ]);
  const accounts = [...accountKeys]
    .map((accountKey) =>
      buildXAccountReport({
        accountKey,
        state: stateByAccount.get(accountKey),
        events: eventsByAccount.get(accountKey) ?? [],
      }),
    )
    .sort(
      (left, right) =>
        left.priorityRank - right.priorityRank ||
        left.accountFingerprint.localeCompare(right.accountFingerprint),
    );

  return {
    available: true,
    accountCount: accounts.length,
    eventCount: events.length,
    passStartedCount: countEvents(events, "pass_started"),
    passSucceededCount: countEvents(events, "pass_succeeded"),
    passFailedCount: countEvents(events, "pass_failed"),
    cooldownObservedCount: countEvents(events, "cooldown_observed"),
    rateLimitCount: events.filter(isRateLimitEvent).length,
    accountLimitProfileObservedCount: accounts.filter(
      (account) =>
        account.dailyRequestsLimit !== null &&
        account.dailyTweetsLimit !== null,
    ).length,
    totalEstimatedRequestCost: sumEventNumbers(
      events,
      (event) => event.estimated_request_cost,
    ),
    totalRequestDelta: sumEventNumbers(events, requestDelta),
    totalTweetDelta: sumEventNumbers(events, tweetDelta),
    totalReturnedCount: sumEventNumbers(
      events,
      (event) => event.returned_count,
    ),
    accounts,
    readError: null,
  } as const;
}

function emptyXCollectorLedgerReport(
  available: boolean,
  readError: string | null,
) {
  return {
    available,
    runCount: 0,
    completedRunCount: 0,
    failedRunCount: 0,
    partialUsableRunCount: 0,
    partialUsableReturnedTweetCount: 0,
    hardFailedRunCount: 0,
    nonTerminalOrUnknownRunCount: 0,
    usableRunCount: 0,
    completedRunRate: 0,
    usableRunRate: 0,
    failedReturnedTweetCount: 0,
    returnedTweetCount: 0,
    distinctQueryHashCount: 0,
    firstStartedAt: null,
    lastStartedAt: null,
    displayTypeBreakdown: {},
    strictEngagementRunCount: 0,
    discoveryRunCount: 0,
    orGroupRunCount: 0,
    phraseQueryRunCount: 0,
    taskFailureCount: 0,
    retryCount: 0,
    hasTopAndLatest: false,
    hasStrictAndDiscoveryLanes: false,
    invalidJsonFieldCount: 0,
    invalidJsonFields: [],
    readError,
    queryFamilyFingerprints: [],
  } as const;
}

function emptyXAccountPoolReport(
  available: boolean,
  readError: string | null,
  stateRows: readonly XAccountStateRow[] = [],
) {
  return {
    available,
    accountCount: stateRows.length,
    eventCount: 0,
    passStartedCount: 0,
    passSucceededCount: 0,
    passFailedCount: 0,
    cooldownObservedCount: 0,
    rateLimitCount: 0,
    accountLimitProfileObservedCount: 0,
    totalEstimatedRequestCost: 0,
    totalRequestDelta: 0,
    totalTweetDelta: 0,
    totalReturnedCount: 0,
    accounts: stateRows.map((state) =>
      buildXAccountReport({
        accountKey: accountBucketKey(state.id, state.username),
        state,
        events: [],
      }),
    ),
    readError,
  } as const;
}

function buildXAccountReport(params: {
  readonly accountKey: string;
  readonly state: XAccountStateRow | undefined;
  readonly events: readonly XAccountUsageEventRow[];
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

  return {
    accountFingerprint: fingerprint(
      `x-account:${accountId ?? params.accountKey}`,
    ),
    usernameFingerprint:
      username.trim().length === 0 ? null : fingerprint(`x-user:${username}`),
    priorityRank: latestAccountPriority ?? accountId ?? 9999,
    prioritySource:
      latestAccountPriority === null ? "account_order" : "account_profile",
    status: params.state?.status ?? null,
    busy: params.state?.busy === undefined ? null : params.state.busy === 1,
    dailyRequests: params.state?.daily_requests ?? null,
    dailyTweets: params.state?.daily_tweets ?? null,
    dailyRequestsLimit: latestDailyRequestsLimit,
    dailyTweetsLimit: latestDailyTweetsLimit,
    lastResetDate: params.state?.last_reset_date ?? null,
    lastUsedAt: params.state?.last_used_at ?? latestEventAt,
    latestEventAt,
    cooldownUntil: params.state?.available_until ?? null,
    cooldownReasonFingerprint:
      params.state?.cooldown_reason === null ||
      params.state?.cooldown_reason === undefined
        ? null
        : fingerprint(params.state.cooldown_reason),
    eventCount: params.events.length,
    passStartedCount: countEvents(params.events, "pass_started"),
    passSucceededCount: countEvents(params.events, "pass_succeeded"),
    passFailedCount: countEvents(params.events, "pass_failed"),
    cooldownObservedCount: countEvents(params.events, "cooldown_observed"),
    rateLimitCount: params.events.filter(isRateLimitEvent).length,
    estimatedRequestCost: sumEventNumbers(
      params.events,
      (event) => event.estimated_request_cost,
    ),
    requestDelta: sumEventNumbers(params.events, requestDelta),
    tweetDelta: sumEventNumbers(params.events, tweetDelta),
    fetchedCount: sumEventNumbers(
      params.events,
      (event) => event.fetched_count,
    ),
    acceptedCount: sumEventNumbers(
      params.events,
      (event) => event.accepted_count,
    ),
    returnedCount: sumEventNumbers(
      params.events,
      (event) => event.returned_count,
    ),
  } as const;
}

function readXRunRows(ledgerPath: string):
  | { readonly ok: true; readonly rows: readonly XRunRow[] }
  | {
      readonly ok: false;
      readonly error: string;
    } {
  const sql = `
    select
      run_id,
      status,
      datetime(started_at, 'unixepoch') as started_at,
      datetime(finished_at, 'unixepoch') as finished_at,
      tweets_count,
      query_hash,
      input_json,
      stats_json
    from runs
    order by started_at asc
  `;

  return readSqliteJson<XRunRow>(ledgerPath, sql);
}

function readXAccountUsageEventRows(params: BuildParams):
  | { readonly ok: true; readonly rows: readonly XAccountUsageEventRow[] }
  | {
      readonly ok: false;
      readonly error: string;
    } {
  const runRows = readXRunRows(params.ledgerPath);
  if (!runRows.ok) {
    return runRows;
  }
  const runWindows = executionWindows(
    runRows.rows.filter((row) =>
      runTargetsCollectionDate(row, params.collectionDate),
    ),
  );
  const columns = readSqliteColumnNames(
    params.ledgerPath,
    "account_usage_events",
  );
  if (!columns.ok) {
    return columns;
  }
  const dailyRequestsLimit = columns.columns.has("daily_requests_limit")
    ? "daily_requests_limit"
    : "null as daily_requests_limit";
  const dailyTweetsLimit = columns.columns.has("daily_tweets_limit")
    ? "daily_tweets_limit"
    : "null as daily_tweets_limit";
  const accountPriority = columns.columns.has("account_priority")
    ? "account_priority"
    : "null as account_priority";
  const sql = `
    select
      event_id,
      event_type,
      occurred_at,
      account_id,
      username,
      estimated_request_cost,
      ${dailyRequestsLimit},
      ${dailyTweetsLimit},
      ${accountPriority},
      requests_before,
      requests_after,
      tweets_before,
      tweets_after,
      fetched_count,
      accepted_count,
      returned_count,
      failure_kind,
      cooldown_reason,
      reset_at
    from account_usage_events
    order by occurred_at asc, event_id asc
  `;
  const events = readSqliteJson<XAccountUsageEventRow>(params.ledgerPath, sql);
  if (!events.ok) {
    return events;
  }

  return {
    ok: true,
    rows: events.rows.filter((event) =>
      eventFallsInsideWindows(event, runWindows),
    ),
  };
}

function readXAccountStateRows(ledgerPath: string):
  | { readonly ok: true; readonly rows: readonly XAccountStateRow[] }
  | {
      readonly ok: false;
      readonly error: string;
    } {
  const sql = `
    select
      id,
      username,
      status,
      daily_requests,
      daily_tweets,
      last_reset_date,
      case
        when available_til is not null and available_til > 0
        then datetime(available_til, 'unixepoch')
        else null
      end as available_until,
      case
        when last_used is not null and last_used > 0
        then datetime(last_used, 'unixepoch')
        else null
      end as last_used_at,
      cooldown_reason,
      busy
    from accounts
    order by id asc
  `;

  return readSqliteJson<XAccountStateRow>(ledgerPath, sql);
}

function readSqliteJson<TValue>(
  ledgerPath: string,
  sql: string,
):
  | { readonly ok: true; readonly rows: readonly TValue[] }
  | {
      readonly ok: false;
      readonly error: string;
    } {
  try {
    const output = execFileSync(
      "sqlite3",
      [
        "-readonly",
        "-json",
        `${pathToFileURL(ledgerPath).href}?immutable=1`,
        sql,
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const normalized = output.trim();

    return {
      ok: true,
      rows:
        normalized.length === 0
          ? []
          : (JSON.parse(normalized) as readonly TValue[]),
    };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

function readSqliteColumnNames(
  ledgerPath: string,
  tableName: string,
):
  | { readonly ok: true; readonly columns: ReadonlySet<string> }
  | {
      readonly ok: false;
      readonly error: string;
    } {
  const result = readSqliteJson<{ readonly name?: string }>(
    ledgerPath,
    `PRAGMA table_info(${tableName})`,
  );
  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    columns: new Set(
      result.rows
        .map((row) => row.name)
        .filter((value): value is string => value !== undefined),
    ),
  };
}

function runTargetsCollectionDate(
  row: XRunRow,
  collectionDate: string,
): boolean {
  const input = parseJson<XRunInput>(row.input_json);
  if (input === undefined) {
    return false;
  }

  return scweetWindowContainsDate(input.since, input.until, collectionDate);
}

function scweetWindowContainsDate(
  since: string | undefined,
  until: string | undefined,
  collectionDate: string,
): boolean {
  const sinceAt = parseScweetTimestamp(since);
  const untilAt = parseScweetTimestamp(until);
  const dayStartedAt = Date.parse(`${collectionDate}T00:00:00.000Z`);
  if (
    sinceAt === undefined ||
    untilAt === undefined ||
    !Number.isFinite(dayStartedAt)
  ) {
    return false;
  }

  const dayEndedAt = dayStartedAt + 24 * 60 * 60 * 1000;
  return sinceAt < dayEndedAt && untilAt > dayStartedAt;
}

function executionWindows(
  rows: readonly XRunRow[],
): readonly { readonly startedAt: number; readonly finishedAt: number }[] {
  const marginMs = 5 * 60 * 1000;
  return rows.flatMap((row) => {
    const times = [
      parseTimestamp(row.started_at),
      parseTimestamp(row.finished_at),
    ].filter((time): time is number => time !== undefined);
    if (times.length === 0) {
      return [];
    }

    return [
      {
        startedAt: Math.min(...times) - marginMs,
        finishedAt: Math.max(...times) + marginMs,
      },
    ];
  });
}

function eventFallsInsideWindows(
  event: XAccountUsageEventRow,
  windows: readonly {
    readonly startedAt: number;
    readonly finishedAt: number;
  }[],
): boolean {
  const occurredAt = parseTimestamp(event.occurred_at);

  return (
    occurredAt !== undefined &&
    windows.some(
      (window) =>
        window.startedAt <= occurredAt && occurredAt <= window.finishedAt,
    )
  );
}

function parseScweetTimestamp(value: string | undefined): number | undefined {
  const match = value?.match(
    /^(\d{4}-\d{2}-\d{2})(?:[T_ ](\d{2}:\d{2}:\d{2})(?:\.\d+)?(?:Z|_UTC)?)?$/u,
  );
  if (match === null || match === undefined) {
    return undefined;
  }

  const parsed = Date.parse(`${match[1]}T${match[2] ?? "00:00:00"}Z`);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseTimestamp(
  value: string | null | undefined,
): number | undefined {
  if (value === null || value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const normalized = value.includes("T")
    ? value
    : `${value.replace(" ", "T")}Z`;
  const parsed = Date.parse(normalized);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function accountBucketKey(
  accountId: number | null | undefined,
  username: string | null | undefined,
): string {
  if (accountId !== null && accountId !== undefined) {
    return `id:${accountId}`;
  }

  const trimmed = username?.trim();
  return trimmed === undefined || trimmed.length === 0
    ? "unknown"
    : `username:${trimmed}`;
}

function eventAccountBucketKey(
  event: XAccountUsageEventRow,
  stateKeyByUsername: ReadonlyMap<string, string>,
): string | undefined {
  if (event.account_id !== null && event.account_id !== undefined) {
    return accountBucketKey(event.account_id, event.username);
  }

  const username = event.username?.trim();
  if (username === undefined || username.length === 0) {
    return undefined;
  }

  return stateKeyByUsername.get(username);
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

function groupBy<TKey, TValue>(
  values: readonly TValue[],
  keyOf: (value: TValue) => TKey,
): Map<TKey, TValue[]> {
  const grouped = new Map<TKey, TValue[]>();

  for (const value of values) {
    const key = keyOf(value);
    const bucket = grouped.get(key) ?? [];

    bucket.push(value);
    grouped.set(key, bucket);
  }

  return grouped;
}

function parseJson<TValue>(value: string | undefined): TValue | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(value) as TValue;
  } catch {
    return undefined;
  }
}

function parseJsonField<TValue>(
  row: XRunRow,
  field: "input_json" | "stats_json",
):
  | { readonly ok: true; readonly value: TValue | undefined }
  | { readonly ok: false; readonly warning: XCollectorJsonWarning } {
  try {
    return { ok: true, value: parseJsonStrict<TValue>(row[field]) };
  } catch (error) {
    return {
      ok: false,
      warning: {
        runId: row.run_id ?? null,
        field,
        reason: errorMessage(error),
      },
    };
  }
}

function parseJsonStrict<TValue>(
  value: string | undefined,
): TValue | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  return JSON.parse(value) as TValue;
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function fingerprint(value: string): string {
  return hashText(value).slice(0, 12);
}

function roundMetric(value: number): number {
  return Number(value.toFixed(3));
}

function normalizedTweetCount(value: number | undefined): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : 0;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
