import { execFileSync, spawnSync } from "node:child_process";

type EventOptionalColumn =
  | "account_priority"
  | "attribution_status"
  | "collector_run_id"
  | "daily_requests_limit"
  | "daily_tweets_limit"
  | "observation_relation"
  | "pass_observation_id";

const EVENT_OPTIONAL_COLUMN_SQL: Record<EventOptionalColumn, string> = {
  account_priority: "account_priority integer",
  attribution_status: "attribution_status text",
  collector_run_id: "collector_run_id text",
  daily_requests_limit: "daily_requests_limit integer",
  daily_tweets_limit: "daily_tweets_limit integer",
  observation_relation: "observation_relation text",
  pass_observation_id: "pass_observation_id text",
};

const PYTHON_SQLITE_SHIM = String.raw`
import json
import pathlib
import sqlite3
import sys

request = json.loads(sys.argv[1])
database_path = pathlib.Path(request["databasePath"]).resolve()
readonly = request["readonly"]
database = database_path.as_uri() + ("?mode=ro" if readonly else "")
connection = sqlite3.connect(database, uri=True)
connection.row_factory = sqlite3.Row
try:
    if request["json"]:
        cursor = connection.execute(request["sql"])
        sys.stdout.write(json.dumps(
            [dict(row) for row in cursor.fetchall()],
            separators=(",", ":"),
        ))
    else:
        connection.executescript(request["sql"])
        connection.commit()
finally:
    connection.close()
`;

export const sqliteTestExecFileSync = ((
  command: string,
  args: readonly string[] = [],
): string => {
  if (command !== "sqlite3") {
    throw new Error(`Unexpected test command: ${command}`);
  }

  const sqliteArgs = [...args];
  let readonly = false;
  let json = false;
  while (sqliteArgs[0]?.startsWith("-") === true) {
    const option = sqliteArgs.shift();
    if (option === "-readonly") {
      readonly = true;
    } else if (option === "-json") {
      json = true;
    } else {
      throw new Error(`Unsupported sqlite3 test option: ${option}`);
    }
  }
  const [databasePath, sql, ...unexpected] = sqliteArgs;
  if (
    databasePath === undefined ||
    sql === undefined ||
    unexpected.length > 0
  ) {
    throw new Error("Expected sqlite3 database path and SQL arguments");
  }

  const result = spawnSync(
    "python3",
    [
      "-c",
      PYTHON_SQLITE_SHIM,
      JSON.stringify({ databasePath, sql, readonly, json }),
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "Python sqlite3 shim failed");
  }

  return result.stdout;
}) as typeof execFileSync;

export function createLedgerTables(params: {
  readonly dbPath: string;
  readonly accounts?: boolean;
  readonly events?: boolean;
  readonly eventOptionalColumns?: readonly EventOptionalColumn[];
}): void {
  const optionalEventColumns = (params.eventOptionalColumns ?? [])
    .map((column) => EVENT_OPTIONAL_COLUMN_SQL[column])
    .join(",\n");
  const optionalEventColumnsSql =
    optionalEventColumns.length === 0 ? "" : `${optionalEventColumns},`;

  execSql(
    params.dbPath,
    `
      create table runs (
        id integer primary key,
        run_id text not null,
        status text not null,
        started_at real not null,
        finished_at real,
        query_hash text not null,
        tweets_count integer not null,
        input_json text,
        stats_json text
      );
      ${
        params.accounts === true
          ? `
            create table accounts (
              id integer primary key,
              username text not null,
              status integer not null,
              available_til real,
              busy integer not null,
              daily_requests integer not null,
              daily_tweets integer not null,
              last_reset_date text,
              last_used real,
              cooldown_reason text
            );
          `
          : ""
      }
      ${
        params.events === true
          ? `
            create table account_usage_events (
              event_id text primary key,
              event_type text not null,
              provider text not null,
              occurred_at text not null,
              ${optionalEventColumnsSql}
              account_id integer,
              username text,
              request_id text not null,
              scan_job_id text not null,
              source_binding_id text not null,
              query text not null,
              pass_label text,
              product text,
              estimated_request_cost integer,
              requests_before integer,
              requests_after integer,
              tweets_before integer,
              tweets_after integer,
              fetched_count integer,
              accepted_count integer,
              returned_count integer,
              failure_kind text,
              cooldown_reason text,
              reset_at text
            );
          `
          : ""
      }
    `,
  );
}

export function insertRun(params: {
  readonly dbPath: string;
  readonly id: number;
  readonly displayType: "Top" | "Latest";
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly tweets: number;
  readonly runId?: string;
  readonly since?: string;
  readonly until?: string;
  readonly status?: string;
  readonly inputJson?: string | null;
  readonly statsJson?: string | null;
}): void {
  const defaultInput = JSON.stringify({
    since: params.since ?? "2026-07-07_00:00:00_UTC",
    until: params.until ?? "2026-07-09_23:59:59_UTC",
    search_query: "openai anthropic claude llm",
    display_type: params.displayType,
    min_likes: params.displayType === "Top" ? 50 : 3,
    min_retweets: params.displayType === "Top" ? 10 : null,
    min_replies: params.displayType === "Top" ? 5 : null,
  });
  const input =
    params.inputJson === undefined ? defaultInput : params.inputJson;
  const stats =
    params.statsJson === undefined
      ? JSON.stringify({ tasks_failed: 0, retries: 0 })
      : params.statsJson;

  execSql(
    params.dbPath,
    `
      insert into runs (
        id, run_id, status, started_at, finished_at, query_hash,
        tweets_count, input_json, stats_json
      ) values (
        ${params.id}, ${sqlString(params.runId ?? `run-${params.id}`)},
        ${sqlString(params.status ?? "completed")},
        ${epochSeconds(params.startedAt)},
        ${
          params.finishedAt === null
            ? "null"
            : epochSeconds(params.finishedAt)
        },
        'hash-${params.id}', ${params.tweets}, ${sqlNullableString(input)},
        ${sqlNullableString(stats)}
      );
    `,
  );
}

export function insertEvent(params: {
  readonly dbPath: string;
  readonly id: string;
  readonly type: string;
  readonly occurredAt: string;
  readonly accountId: number | null;
  readonly username?: string | null;
  readonly fetched: number | null;
  readonly accepted: number | null;
  readonly requestId?: string;
  readonly scanJobId?: string;
}): void {
  execSql(
    params.dbPath,
    `
      insert into account_usage_events (
        event_id, event_type, provider, occurred_at, account_id, username,
        request_id, scan_job_id, source_binding_id, query, pass_label, product,
        estimated_request_cost, requests_before, requests_after, tweets_before,
        tweets_after, fetched_count, accepted_count, returned_count,
        failure_kind, cooldown_reason, reset_at
      ) values (
        ${sqlString(params.id)}, ${sqlString(params.type)}, 'x-twitter',
        ${sqlString(params.occurredAt)}, ${params.accountId ?? "null"},
        ${sqlNullableString(params.username ?? "research_account")},
        ${sqlString(params.requestId ?? "run-1")},
        ${sqlString(params.scanJobId ?? "scan-1")}, 'binding-1',
        'openai anthropic claude llm', 'top_base', 'search', 6,
        0, 1, 0, 1, ${params.fetched ?? "null"},
        ${params.accepted ?? "null"}, null, null, null, null
      );
    `,
  );
}

export function insertUnrelatedHistory(
  dbPath: string,
  count = 12_000,
): void {
  if (!Number.isSafeInteger(count) || count < 1 || count > 99_999) {
    throw new Error("History count must be between 1 and 99,999");
  }
  const sequence = `
    with digits(value) as (
      values (0),(1),(2),(3),(4),(5),(6),(7),(8),(9)
    ),
    sequence(value) as (
      select
        ones.value + tens.value * 10 + hundreds.value * 100
          + thousands.value * 1000 + ten_thousands.value * 10000 + 1
      from digits ones
      cross join digits tens
      cross join digits hundreds
      cross join digits thousands
      cross join digits ten_thousands
      where ones.value + tens.value * 10 + hundreds.value * 100
        + thousands.value * 1000 + ten_thousands.value * 10000 < ${count}
    )
  `;
  const unrelatedInput = sqlString(
    JSON.stringify({
      since: "2025-01-01_00:00:00_UTC",
      until: "2025-01-02_00:00:00_UTC",
      search_query: "unrelated history",
      display_type: "Top",
    }),
  );

  execSql(
    dbPath,
    `
      ${sequence}
      insert into runs (
        id, run_id, status, started_at, finished_at, query_hash,
        tweets_count, input_json, stats_json
      )
      select
        100000 + value, 'history-run-' || value, 'completed',
        ${epochSeconds("2025-01-03T00:00:00.000Z")},
        ${epochSeconds("2025-01-03T00:00:01.000Z")},
        'history-hash-' || value, 1, ${unrelatedInput}, '{"retries":0}'
      from sequence;

      ${sequence}
      insert into account_usage_events (
        event_id, event_type, provider, occurred_at, account_id, username,
        request_id, scan_job_id, source_binding_id, query, pass_label, product,
        estimated_request_cost, requests_before, requests_after, tweets_before,
        tweets_after, fetched_count, accepted_count, returned_count,
        failure_kind, cooldown_reason, reset_at
      )
      select
        'history-event-' || value, 'pass_succeeded', 'x-twitter',
        '2025-01-03T00:00:00.000Z', null, null,
        'history-request-' || value, 'history-scan-' || value, 'binding-history',
        'unrelated history', 'top_base', 'search', 1, 0, 1, 0, 1,
        1, 1, 1, null, null, null
      from sequence;
    `,
  );
}

export function execSql(dbPath: string, sql: string): void {
  execFileSync("sqlite3", [dbPath, sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function epochSeconds(value: string): number {
  return Date.parse(value) / 1000;
}

export function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function sqlNullableString(value: string | null): string {
  return value === null ? "null" : sqlString(value);
}
