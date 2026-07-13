import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildXAccountPoolReport,
  buildXCollectorLedgerReport,
} from "./x-collector-quality-report-support";

jest.mock("node:child_process", () => {
  const actual = jest.requireActual("node:child_process") as Record<
    string,
    unknown
  > & {
    readonly execFileSync: typeof execFileSync;
  };

  return {
    ...actual,
    execFileSync: jest.fn(actual.execFileSync),
  };
});

describe("x collector quality report support", () => {
  it("reads the ledger in read-only mode and counts target search windows", () => {
    const directory = mkdtempSync(join(tmpdir(), "x-collector-quality-"));
    const dbPath = join(directory, "scweet_state.db");

    try {
      execSql(
        dbPath,
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
          create table account_usage_events (
            event_id text primary key,
            event_type text not null,
            provider text not null,
            occurred_at text not null,
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
        `,
      );
      insertRun({
        dbPath,
        id: 1,
        displayType: "Top",
        startedAt: "2026-07-09T04:23:22Z",
        finishedAt: "2026-07-09T04:23:25Z",
        tweets: 31,
      });
      insertRun({
        dbPath,
        id: 2,
        displayType: "Latest",
        startedAt: "2026-07-09T04:23:25Z",
        finishedAt: null,
        tweets: 20,
      });
      insertRun({
        dbPath,
        id: 3,
        displayType: "Top",
        startedAt: "2026-07-09T04:40:00Z",
        finishedAt: "2026-07-09T04:41:00Z",
        tweets: 99,
        since: "2026-07-08_00:00:00_UTC",
        until: "2026-07-08_23:59:59_UTC",
      });
      insertRun({
        dbPath,
        id: 4,
        displayType: "Top",
        startedAt: "2026-07-07T04:40:00Z",
        finishedAt: "2026-07-07T04:41:00Z",
        tweets: 99,
        since: "2026-07-06",
        until: "2026-07-07",
        status: "failed",
      });
      insertRun({
        dbPath,
        id: 5,
        displayType: "Top",
        startedAt: "2026-07-09T04:50:00Z",
        finishedAt: null,
        tweets: 0,
        status: "running",
        statsJson: null,
      });
      execSql(
        dbPath,
        `
          insert into accounts (
            id, username, status, available_til, busy, daily_requests,
            daily_tweets, last_reset_date, last_used, cooldown_reason
          ) values (
            1, 'research_account', 1, null, 0, 3, 51, '2026-07-09',
            ${epochSeconds("2026-07-09T04:23:29Z")}, null
          );
        `,
      );
      insertEvent({
        dbPath,
        id: "event-started",
        type: "pass_started",
        occurredAt: "2026-07-09T04:23:22.500Z",
        accountId: null,
        fetched: null,
        accepted: null,
      });
      insertEvent({
        dbPath,
        id: "event-succeeded",
        type: "pass_succeeded",
        occurredAt: "2026-07-09T04:23:25.500Z",
        accountId: 1,
        fetched: 31,
        accepted: 9,
      });
      insertEvent({
        dbPath,
        id: "event-unattributed-failed",
        type: "pass_failed",
        occurredAt: "2026-07-09T04:23:26.000Z",
        accountId: null,
        username: null,
        fetched: null,
        accepted: null,
      });
      insertEvent({
        dbPath,
        id: "event-unrelated",
        type: "pass_succeeded",
        occurredAt: "2026-07-09T05:40:00.000Z",
        accountId: 1,
        fetched: 99,
        accepted: 99,
      });
      insertEvent({
        dbPath,
        id: "event-old-target-date-failure",
        type: "pass_failed",
        occurredAt: "2026-07-07T12:00:00.000Z",
        accountId: 1,
        fetched: null,
        accepted: null,
      });

      jest.mocked(execFileSync).mockClear();
      const ledger = buildXCollectorLedgerReport({
        ledgerPath: dbPath,
        collectionDate: "2026-07-07",
      });
      const accountPool = buildXAccountPoolReport({
        ledgerPath: dbPath,
        collectionDate: "2026-07-07",
      });

      expect(ledger.runCount).toBe(3);
      expect(ledger.failedRunCount).toBe(0);
      expect(ledger.nonTerminalOrUnknownRunCount).toBe(1);
      expect(ledger.invalidJsonFieldCount).toBe(0);
      expect(ledger.returnedTweetCount).toBe(51);
      expect(ledger.hasTopAndLatest).toBe(true);
      expect(accountPool.eventCount).toBe(3);
      expect(accountPool.accountCount).toBe(1);
      expect(accountPool.passStartedCount).toBe(1);
      expect(accountPool.passSucceededCount).toBe(1);
      expect(accountPool.passFailedCount).toBe(1);
      expect(accountPool.accountLimitProfileObservedCount).toBe(0);
      expect(accountPool.accounts[0]?.passStartedCount).toBe(1);
      expect(accountPool.accounts[0]?.fetchedCount).toBe(31);
      expect(accountPool.accounts[0]?.dailyRequestsLimit).toBeNull();
      expect(accountPool.accounts[0]?.dailyTweetsLimit).toBeNull();
      expect(jest.mocked(execFileSync)).toHaveBeenCalled();
      for (const [command, args] of jest.mocked(execFileSync).mock.calls) {
        expect(command).toBe("sqlite3");
        expect(Array.isArray(args)).toBe(true);
        if (!Array.isArray(args)) {
          continue;
        }
        expect(args.slice(0, 2)).toEqual(["-readonly", "-json"]);
        const ledgerUri = new URL(String(args[2]));
        expect(ledgerUri.protocol).toBe("file:");
        expect(ledgerUri.searchParams.get("immutable")).toBe("1");
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("uses the target UTC window instead of run execution date", () => {
    const directory = mkdtempSync(join(tmpdir(), "x-collector-quality-"));
    const dbPath = join(directory, "scweet_state.db");

    try {
      execSql(
        dbPath,
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
        `,
      );
      insertRun({
        dbPath,
        id: 1,
        displayType: "Top",
        startedAt: "2026-07-11T04:00:00Z",
        finishedAt: "2026-07-11T04:01:00Z",
        tweets: 99,
        since: "2026-07-10",
        until: "2026-07-11",
        status: "failed",
      });
      insertRun({
        dbPath,
        id: 2,
        displayType: "Top",
        startedAt: "2026-07-12T00:02:00Z",
        finishedAt: "2026-07-12T00:03:00Z",
        tweets: 31,
        since: "2026-07-11",
        until: "2026-07-12",
      });
      insertRun({
        dbPath,
        id: 3,
        displayType: "Latest",
        startedAt: "2026-07-12T00:03:00Z",
        finishedAt: "2026-07-12T00:04:00Z",
        tweets: 20,
        since: "2026-07-11_00:00:00_UTC",
        until: "2026-07-11_23:59:59_UTC",
      });

      const ledger = buildXCollectorLedgerReport({
        ledgerPath: dbPath,
        collectionDate: "2026-07-11",
      });

      expect(ledger.runCount).toBe(2);
      expect(ledger.completedRunCount).toBe(2);
      expect(ledger.failedRunCount).toBe(0);
      expect(ledger.returnedTweetCount).toBe(51);
      expect(ledger.hasTopAndLatest).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("treats failed Scweet runs with collected tweets as usable partial runs", () => {
    const directory = mkdtempSync(join(tmpdir(), "x-collector-quality-"));
    const dbPath = join(directory, "scweet_state.db");

    try {
      execSql(
        dbPath,
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
        `,
      );
      insertRun({
        dbPath,
        id: 1,
        displayType: "Top",
        startedAt: "2026-07-12T00:01:00Z",
        finishedAt: "2026-07-12T00:02:00Z",
        tweets: 20,
        since: "2026-07-11",
        until: "2026-07-12",
      });
      insertRun({
        dbPath,
        id: 2,
        displayType: "Latest",
        startedAt: "2026-07-12T00:02:00Z",
        finishedAt: "2026-07-12T00:03:00Z",
        tweets: 9,
        since: "2026-07-11",
        until: "2026-07-12",
        status: "failed",
      });
      insertRun({
        dbPath,
        id: 4,
        displayType: "Top",
        startedAt: "2026-07-12T00:04:00Z",
        finishedAt: "2026-07-12T00:05:00Z",
        tweets: 99,
        since: "2026-07-11",
        until: "2026-07-12",
        status: "running",
      });
      insertRun({
        dbPath,
        id: 3,
        displayType: "Latest",
        startedAt: "2026-07-12T00:03:00Z",
        finishedAt: "2026-07-12T00:04:00Z",
        tweets: 0,
        since: "2026-07-11",
        until: "2026-07-12",
        status: "failed",
      });

      const ledger = buildXCollectorLedgerReport({
        ledgerPath: dbPath,
        collectionDate: "2026-07-11",
      });

      expect(ledger).toMatchObject({
        runCount: 4,
        completedRunCount: 1,
        failedRunCount: 2,
        partialUsableRunCount: 1,
        partialUsableReturnedTweetCount: 9,
        hardFailedRunCount: 1,
        nonTerminalOrUnknownRunCount: 1,
        usableRunCount: 2,
        completedRunRate: 0.25,
        usableRunRate: 0.5,
        failedReturnedTweetCount: 9,
        returnedTweetCount: 128,
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("reports observed per-account budget limit profiles", () => {
    const directory = mkdtempSync(join(tmpdir(), "x-collector-quality-"));
    const dbPath = join(directory, "scweet_state.db");

    try {
      execSql(
        dbPath,
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
          create table account_usage_events (
            event_id text primary key,
            event_type text not null,
            provider text not null,
            occurred_at text not null,
            account_id integer,
            username text,
            request_id text not null,
            scan_job_id text not null,
            source_binding_id text not null,
            query text not null,
            pass_label text,
            product text,
            estimated_request_cost integer,
            daily_requests_limit integer,
            daily_tweets_limit integer,
            account_priority integer,
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
        `,
      );
      insertRun({
        dbPath,
        id: 1,
        displayType: "Top",
        startedAt: "2026-07-09T04:23:22Z",
        finishedAt: "2026-07-09T04:23:25Z",
        tweets: 31,
      });
      execSql(
        dbPath,
        `
          insert into accounts (
            id, username, status, available_til, busy, daily_requests,
            daily_tweets, last_reset_date, last_used, cooldown_reason
          ) values (
            1, 'premium_research', 1, null, 0, 12, 310, '2026-07-09',
            ${epochSeconds("2026-07-09T04:23:29Z")}, null
          );
          insert into account_usage_events (
            event_id, event_type, provider, occurred_at, account_id, username,
            request_id, scan_job_id, source_binding_id, query, pass_label,
            product, estimated_request_cost, daily_requests_limit,
            daily_tweets_limit, account_priority, requests_before, requests_after,
            tweets_before, tweets_after
          ) values (
            'event-premium', 'budget_snapshot', 'x-twitter',
            '2026-07-09T04:23:22.500Z', 1, 'premium_research',
            'request-1', 'scan-1', 'binding-1',
            'openai anthropic claude llm', null, null, 6, 120, 2000, 0,
            12, 12, 310, 310
          );
        `,
      );

      const accountPool = buildXAccountPoolReport({
        ledgerPath: dbPath,
        collectionDate: "2026-07-07",
      });

      expect(accountPool.accountLimitProfileObservedCount).toBe(1);
      expect(accountPool.accounts[0]?.dailyRequestsLimit).toBe(120);
      expect(accountPool.accounts[0]?.dailyTweetsLimit).toBe(2000);
      expect(accountPool.accounts[0]?.priorityRank).toBe(0);
      expect(accountPool.accounts[0]?.prioritySource).toBe("account_profile");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function insertRun(params: {
  readonly dbPath: string;
  readonly id: number;
  readonly displayType: "Top" | "Latest";
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly tweets: number;
  readonly since?: string;
  readonly until?: string;
  readonly status?: string;
  readonly statsJson?: string | null;
}): void {
  const input = JSON.stringify({
    since: params.since ?? "2026-07-07_00:00:00_UTC",
    until: params.until ?? "2026-07-09_23:59:59_UTC",
    search_query: "openai anthropic claude llm",
    display_type: params.displayType,
    min_likes: params.displayType === "Top" ? 50 : 3,
    min_retweets: params.displayType === "Top" ? 10 : null,
    min_replies: params.displayType === "Top" ? 5 : null,
  });
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
        ${params.id}, 'run-${params.id}', ${sqlString(params.status ?? "completed")},
        ${epochSeconds(params.startedAt)}, ${
          params.finishedAt === null ? "null" : epochSeconds(params.finishedAt)
        },
        'hash-${params.id}', ${params.tweets},
        ${sqlString(input)}, ${sqlNullableString(stats)}
      );
    `,
  );
}

function insertEvent(params: {
  readonly dbPath: string;
  readonly id: string;
  readonly type: string;
  readonly occurredAt: string;
  readonly accountId: number | null;
  readonly username?: string | null;
  readonly fetched: number | null;
  readonly accepted: number | null;
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
        'request-1', 'scan-1', 'binding-1',
        'openai anthropic claude llm', 'top_base', 'search', 6,
        0, 1, 0, 1, ${params.fetched ?? "null"},
        ${params.accepted ?? "null"}, null, null, null, null
      );
    `,
  );
}

function execSql(dbPath: string, sql: string): void {
  execFileSync("sqlite3", [dbPath, sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function epochSeconds(value: string): number {
  return Math.floor(Date.parse(value) / 1000);
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlNullableString(value: string | null): string {
  return value === null ? "null" : sqlString(value);
}
