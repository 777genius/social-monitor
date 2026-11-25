import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";

import {
  buildXAccountAttributionSummary,
  buildXAccountReport,
  summarizeXRateLimitObservations,
  type XAccountStateRow,
  type XAccountUsageEventRow,
} from "./x-account-attribution-report";
import {
  correlateXAccountEventsToTargetRuns,
  type XRunExecutionWindow,
  type XTargetRunEventCorrelation,
} from "./x-target-run-event-correlation";

type XRunRow = {
  readonly run_id?: string;
  readonly status?: string;
  readonly started_at?: string | null;
  readonly finished_at?: string | null;
  readonly started_at_epoch_ms?: number | null;
  readonly finished_at_epoch_ms?: number | null;
  readonly tweets_count?: number;
  readonly query_hash?: string;
  readonly input_json?: string | null;
  readonly stats_json?: string | null;
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

type BuildParams = {
  readonly ledgerPath: string;
  readonly collectionDate: string;
  readonly observedAt?: Date;
};

type SqliteReadError = { readonly ok: false; readonly error: string };
type SqliteRowsResult<TValue> =
  | { readonly ok: true; readonly rows: readonly TValue[] }
  | SqliteReadError;

export type XCollectorLedgerReport = ReturnType<typeof buildXCollectorLedgerReport>;
export type XAccountPoolReport = ReturnType<typeof buildXAccountPoolReport>;

export function buildXCollectorLedgerReport(params: BuildParams) {
  if (!existsSync(params.ledgerPath)) {
    return emptyXCollectorLedgerReport(false, "ledger_file_missing");
  }

  const rowsResult = readXRunRows(params.ledgerPath, params.collectionDate);
  if (!rowsResult.ok) {
    return emptyXCollectorLedgerReport(false, rowsResult.error);
  }

  const rows = rowsResult.rows;
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
  const observedAt = params.observedAt ?? new Date();
  if (!existsSync(params.ledgerPath)) {
    return emptyXAccountPoolReport(
      false,
      "ledger_file_missing",
      [],
      observedAt,
      params.collectionDate,
    );
  }
  const targetRunsResult = readXRunRows(
    params.ledgerPath,
    params.collectionDate,
  );
  const targetRuns = targetRunsResult.ok ? targetRunsResult.rows : [];
  const globalCollectionSucceeded =
    targetRuns.some((row) => row.status === "completed") &&
    targetRuns.some((row) => normalizedTweetCount(row.tweets_count) > 0);

  const stateResult = readXAccountStateRows(params.ledgerPath);
  if (!stateResult.ok) {
    return emptyXAccountPoolReport(
      false,
      stateResult.error,
      [],
      observedAt,
      params.collectionDate,
      globalCollectionSucceeded,
    );
  }

  const eventResult = readXAccountUsageEventRows(params, targetRuns);
  if (!eventResult.ok) {
    return emptyXAccountPoolReport(
      true,
      eventResult.error,
      stateResult.rows,
      observedAt,
      params.collectionDate,
      globalCollectionSucceeded,
    );
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
        allEvents: events,
        collectionDate: params.collectionDate,
        observedAt,
      }),
    )
    .sort(
      (left, right) =>
        left.priorityRank - right.priorityRank ||
        left.accountFingerprint.localeCompare(right.accountFingerprint),
    );
  const attribution = buildXAccountAttributionSummary({
    collectionDate: params.collectionDate,
    events,
    accounts,
    globalCollectionSucceeded,
  });
  const rateLimits = summarizeXRateLimitObservations(events);

  return {
    available: true,
    accountCount: accounts.length,
    totalAccountCount: accounts.length,
    eligibleAccountCount: accounts.filter((account) => account.eligible).length,
    ineligibleAccountCount: accounts.filter((account) => !account.eligible)
      .length,
    observedAt: observedAt.toISOString(),
    eventCount: events.length,
    targetRunEventCorrelationStatus: eventResult.correlation.status,
    ambiguousTargetRunEventCount:
      eventResult.correlation.ambiguousEventCount,
    passStartedCount: countEvents(events, "pass_started"),
    passSucceededCount: attribution.passSucceededCount,
    passFailedCount: attribution.passFailedCount,
    cooldownObservedCount: countEvents(events, "cooldown_observed"),
    rateLimitCount: rateLimits.count,
    rateLimitObservationStatus: rateLimits.status,
    ambiguousLegacyRateLimitEventCount:
      rateLimits.ambiguousLegacyEventCount,
    accountLimitProfileObservedCount: accounts.filter(
      (account) =>
        account.dailyRequestsLimit !== null &&
        account.dailyTweetsLimit !== null,
    ).length,
    totalEstimatedRequestCost: sumEventNumbers(
      events,
      (event) => event.estimated_request_cost,
    ),
    totalRequestDelta: attribution.requestDelta,
    totalTweetDelta: attribution.tweetDelta,
    totalReturnedCount: attribution.returnedCount,
    attributionStatus: attribution.status,
    terminalObservationStatus: attribution.terminalObservationStatus,
    ambiguousPassObservationCount:
      attribution.ambiguousPassObservationCount,
    attributionPolicy: attribution.attributionPolicy,
    attributionGateReason: attribution.gateReason,
    eligibleAccountZeroAttributableOutputWarningCount:
      attribution.eligibleAccountZeroAttributableOutputWarningCount,
    attributionWarnings: attribution.warnings,
    targetWindowAttribution: attribution,
    accounts,
    readError: null,
  } as const;
}

function emptyXCollectorLedgerReport(available: boolean, readError: string | null) {
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
  observedAt: Date = new Date(),
  collectionDate = "unknown",
  globalCollectionSucceeded = false,
) {
  const accounts = stateRows.map((state) =>
    buildXAccountReport({
      accountKey: accountBucketKey(state.id, state.username),
      state,
      events: [],
      allEvents: [],
      collectionDate,
      observedAt,
    }),
  );
  const attribution = buildXAccountAttributionSummary({
    collectionDate,
    events: [],
    accounts,
    globalCollectionSucceeded,
  });
  return {
    available,
    accountCount: stateRows.length,
    totalAccountCount: stateRows.length,
    eligibleAccountCount: accounts.filter((account) => account.eligible).length,
    ineligibleAccountCount: accounts.filter((account) => !account.eligible)
      .length,
    observedAt: observedAt.toISOString(),
    eventCount: 0,
    targetRunEventCorrelationStatus: "unknown",
    ambiguousTargetRunEventCount: 0,
    passStartedCount: 0,
    passSucceededCount: attribution.passSucceededCount,
    passFailedCount: attribution.passFailedCount,
    cooldownObservedCount: 0,
    rateLimitCount: 0,
    rateLimitObservationStatus: "unambiguous",
    ambiguousLegacyRateLimitEventCount: 0,
    accountLimitProfileObservedCount: 0,
    totalEstimatedRequestCost: 0,
    totalRequestDelta: attribution.requestDelta,
    totalTweetDelta: attribution.tweetDelta,
    totalReturnedCount: attribution.returnedCount,
    attributionStatus: attribution.status,
    terminalObservationStatus: attribution.terminalObservationStatus,
    ambiguousPassObservationCount:
      attribution.ambiguousPassObservationCount,
    attributionPolicy: attribution.attributionPolicy,
    attributionGateReason: attribution.gateReason,
    eligibleAccountZeroAttributableOutputWarningCount:
      attribution.eligibleAccountZeroAttributableOutputWarningCount,
    attributionWarnings: attribution.warnings,
    targetWindowAttribution: attribution,
    accounts,
    readError,
  } as const;
}

function readXRunRows(
  ledgerPath: string,
  collectionDate: string,
): SqliteRowsResult<XRunRow> {
  const targetWindow = targetUtcWindow(collectionDate);
  const overlapPredicate =
    targetWindow === undefined
      ? "0"
      : `
        case
          when not json_valid(input_json) then 0
          when json_type(input_json, '$.since') = 'text'
            and json_type(input_json, '$.until') = 'text'
          then
            julianday(${normalizedJsonTimestamp("$.since")})
              < julianday(${sqliteString(
                new Date(targetWindow.endedAt).toISOString(),
              )})
            and julianday(${normalizedJsonTimestamp("$.until")})
              > julianday(${sqliteString(
                new Date(targetWindow.startedAt).toISOString(),
              )})
          else 0
        end
      `;
  const sql = `
    select
      cast(run_id as text) as run_id,
      status,
      datetime(started_at, 'unixepoch') as started_at,
      datetime(finished_at, 'unixepoch') as finished_at,
      started_at * 1000 as started_at_epoch_ms,
      finished_at * 1000 as finished_at_epoch_ms,
      tweets_count,
      query_hash,
      input_json,
      stats_json
    from runs
    where ${overlapPredicate}
    order by started_at asc, run_id asc
  `;
  const result = readSqliteJson<XRunRow>(ledgerPath, sql);

  return result.ok
    ? {
        ok: true,
        rows: result.rows.filter((row) =>
          runTargetsCollectionDate(row, collectionDate),
        ),
      }
    : result;
}

function readXAccountUsageEventRows(
  params: BuildParams,
  targetRuns: readonly XRunRow[],
):
  | {
      readonly ok: true;
      readonly rows: readonly XAccountUsageEventRow[];
      readonly correlation: XTargetRunEventCorrelation;
    }
  | SqliteReadError {
  const runWindows = executionWindows(targetRuns);
  const columns = readSqliteColumnNames(
    params.ledgerPath,
    "account_usage_events",
  );
  if (!columns.ok) {
    return columns;
  }
  const selected = (column: string) =>
    columns.columns.has(column) ? column : `null as ${column}`;
  const selectedIdentity = (column: string) =>
    columns.columns.has(column)
      ? `cast(${column} as text) as ${column}`
      : `null as ${column}`;
  const targetRunIds = [
    ...new Set(
      targetRuns
        .map((run) => normalizedIdentity(run.run_id))
        .filter((value): value is string => value !== undefined),
    ),
  ].sort();
  const targetRunIdRows =
    targetRunIds.length === 0
      ? "select null as run_id where 0"
      : `values ${targetRunIds
          .map((runId) => `(${sqliteString(runId)})`)
          .join(", ")}`;
  const eventScopePredicate =
    targetRunIds.length === 0
      ? "0"
      : buildEventScopePredicate(columns.columns, runWindows);
  const sql = `
    with
      target_run_ids(run_id) as (${targetRunIdRows}),
      target_correlation_keys(request_id, scan_job_id) as (
        select distinct
          ${normalizedColumn(columns.columns, "request_id")},
          ${normalizedColumn(columns.columns, "scan_job_id")}
        from account_usage_events
        where ${targetEventAnchorPredicate(columns.columns)}
      )
    select
      event_id,
      event_type,
      occurred_at,
      ${selected("pass_observation_id")},
      ${selected("observation_relation")},
      ${selectedIdentity("request_id")},
      ${selectedIdentity("scan_job_id")},
      ${selectedIdentity("collector_run_id")},
      account_id,
      username,
      estimated_request_cost,
      ${selected("daily_requests_limit")},
      ${selected("daily_tweets_limit")},
      ${selected("account_priority")},
      requests_before,
      requests_after,
      tweets_before,
      tweets_after,
      fetched_count,
      accepted_count,
      returned_count,
      failure_kind,
      cooldown_reason,
      reset_at,
      ${selected("attribution_status")}
    from account_usage_events
    where ${eventScopePredicate}
    order by occurred_at asc, event_id asc
  `;
  const events = readSqliteJson<XAccountUsageEventRow>(params.ledgerPath, sql);
  if (!events.ok) {
    return events;
  }

  const correlated = correlateXAccountEventsToTargetRuns({
    events: events.rows,
    targetRunIds: targetRuns.map((run) => run.run_id),
    legacyWindows: runWindows,
  });

  return { ok: true, ...correlated };
}

function readXAccountStateRows(ledgerPath: string): SqliteRowsResult<XAccountStateRow> {
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
): SqliteRowsResult<TValue> {
  try {
    const output = execFileSync(
      "sqlite3",
      ["-readonly", "-json", ledgerPath, sql],
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
  | SqliteReadError {
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
  const targetWindow = targetUtcWindow(collectionDate);
  const sinceAt = parseScweetTimestamp(input?.since);
  const untilAt = parseScweetTimestamp(input?.until);
  if (
    targetWindow === undefined ||
    sinceAt === undefined ||
    untilAt === undefined
  ) {
    return false;
  }

  return sinceAt < targetWindow.endedAt && untilAt > targetWindow.startedAt;
}

function executionWindows(
  rows: readonly XRunRow[],
): readonly XRunExecutionWindow[] {
  const marginMs = 5 * 60 * 1000;
  return rows.flatMap((row) => {
    const times = [row.started_at_epoch_ms, row.finished_at_epoch_ms].filter(
      (time): time is number =>
        typeof time === "number" && Number.isFinite(time),
    );
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

function buildEventScopePredicate(
  columns: ReadonlySet<string>,
  windows: readonly XRunExecutionWindow[],
): string {
  const collectorRunId = normalizedColumn(columns, "collector_run_id");
  const requestId = normalizedColumn(columns, "request_id");
  const scanJobId = normalizedColumn(columns, "scan_job_id");
  const insideWindow =
    windows.length === 0
      ? "0"
      : windows
          .map(
            (window) => `
              julianday(occurred_at) between
                julianday(${sqliteString(new Date(window.startedAt).toISOString())})
                and julianday(${sqliteString(
                  new Date(window.finishedAt).toISOString(),
                )})
            `,
          )
          .join(" or ");

  return `
    (${collectorRunId} is null
      or ${collectorRunId} in (select run_id from target_run_ids))
    and (
      exists (
        select 1
        from target_correlation_keys
        where target_correlation_keys.request_id = ${requestId}
          and target_correlation_keys.scan_job_id = ${scanJobId}
      )
      or (${insideWindow})
    )
  `;
}

function targetEventAnchorPredicate(columns: ReadonlySet<string>): string {
  const collectorRunId = normalizedColumn(columns, "collector_run_id");
  const requestId = normalizedColumn(columns, "request_id");
  const scanJobId = normalizedColumn(columns, "scan_job_id");

  return `
    ${requestId} is not null
    and ${scanJobId} is not null
    and (
      ${collectorRunId} in (select run_id from target_run_ids)
      or (
        ${collectorRunId} is null
        and (
          ${requestId} in (select run_id from target_run_ids)
          or ${scanJobId} in (select run_id from target_run_ids)
        )
      )
    )
  `;
}

function normalizedColumn(columns: ReadonlySet<string>, column: string): string {
  return columns.has(column)
    ? `nullif(trim(account_usage_events.${column}), '')`
    : "null";
}

function normalizedJsonTimestamp(path: "$.since" | "$.until"): string {
  return `replace(replace(json_extract(input_json, '${path}'), '_UTC', 'Z'), '_', 'T')`;
}

function targetUtcWindow(
  collectionDate: string,
): { readonly startedAt: number; readonly endedAt: number } | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(collectionDate)) {
    return undefined;
  }
  const startedAt = Date.parse(`${collectionDate}T00:00:00.000Z`);
  if (
    !Number.isFinite(startedAt) ||
    new Date(startedAt).toISOString().slice(0, 10) !== collectionDate
  ) {
    return undefined;
  }

  return {
    startedAt,
    endedAt: startedAt + 24 * 60 * 60 * 1000,
  };
}

function parseScweetTimestamp(value: unknown): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const match = value?.match(
    /^(\d{4}-\d{2}-\d{2})(?:[T_ ](\d{2}:\d{2}:\d{2})(\.\d+)?(?:Z|_UTC)?)?$/u,
  );
  if (match === null || match === undefined) {
    return undefined;
  }

  const parsed = Date.parse(
    `${match[1]}T${match[2] ?? "00:00:00"}${match[3] ?? ""}Z`,
  );
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizedIdentity(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0
    ? undefined
    : normalized;
}

function sqliteString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
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

function countEvents(events: readonly XAccountUsageEventRow[], eventType: string): number {
  return events.filter((event) => event.event_type === eventType).length;
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

function parseJson<TValue>(
  value: string | null | undefined,
): TValue | undefined {
  if (value === null || value === undefined || value.trim().length === 0) {
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
  value: string | null | undefined,
): TValue | undefined {
  if (value === null || value === undefined || value.trim().length === 0) {
    return undefined;
  }

  return JSON.parse(value) as TValue;
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
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
