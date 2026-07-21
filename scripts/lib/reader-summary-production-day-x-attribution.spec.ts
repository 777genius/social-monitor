import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildProductionDayReport } from "./reader-summary-production-day-report";
import { buildXAccountPoolReport } from "./x-collector-quality-report-support";

const collectionDate = "2026-07-20";

describe("production-day X attribution integration", () => {
  it("preserves conflicting terminals and mixed-account status without cross-date contamination", () => {
    const directory = mkdtempSync(join(tmpdir(), "production-day-x-"));
    const dbPath = join(directory, "scweet_state.db");

    try {
      createSchema(dbPath);
      insertOverlappingRuns(dbPath);
      insertAccounts(dbPath);
      insertTargetEvents(dbPath);
      insertEvent(dbPath, {
        id: "other-date-known",
        eventType: "pass_succeeded",
        occurredAt: "2026-07-21T00:01:20.000Z",
        collectorRunId: "run-other-date",
        requestId: "request-target",
        scanJobId: "scan-target",
        accountId: 2,
        passObservationId: "pass-other",
        attributionStatus: "known",
        requestsBefore: 1,
        requestsAfter: 99,
        tweetsBefore: 0,
        tweetsAfter: 99,
        fetchedCount: 99,
        acceptedCount: 99,
      });

      const pool = buildXAccountPoolReport({
        ledgerPath: dbPath,
        collectionDate,
        observedAt: new Date("2026-07-21T00:03:00.000Z"),
      });
      const report = productionDayReport(pool);

      expect(pool).toMatchObject({
        eventCount: 4,
        targetRunEventCorrelationStatus: "exact",
        ambiguousTargetRunEventCount: 0,
        attributionStatus: "partial",
        terminalObservationStatus: "ambiguous",
        ambiguousPassObservationCount: 1,
        totalRequestDelta: 2,
        totalTweetDelta: 4,
        totalReturnedCount: null,
      });
      expect(pool.accounts[0]).toMatchObject({
        attributionStatus: "partial",
        terminalObservationStatus: "ambiguous",
        ambiguousPassObservationCount: 1,
        acceptedCount: 4,
      });
      expect(pool.accounts[1]).toMatchObject({
        attributionStatus: "unknown",
        terminalObservationStatus: "unambiguous",
        ambiguousPassObservationCount: 0,
        requestDelta: 1,
        fetchedCount: null,
        acceptedCount: null,
        warningCodes: [],
      });
      expect(report.stats.xAccountAttribution).toMatchObject({
        status: "partial",
        terminalObservationStatus: "ambiguous",
        ambiguousPassObservationCount: 1,
        targetRunEventCorrelationStatus: "exact",
        ambiguousTargetRunEventCount: 0,
      });
      expect(report.stats.xAccounts[0]).toMatchObject({
        attributionStatus: "partial",
        targetWindowAttribution: {
          status: "partial",
          terminalObservationStatus: "ambiguous",
          ambiguousPassObservationCount: 1,
          acceptedCount: 4,
        },
      });
      expect(report.stats.xAccounts[1]).toMatchObject({
        attributionStatus: "unknown",
        targetWindowAttribution: {
          status: "unknown",
          terminalObservationStatus: "unambiguous",
          ambiguousPassObservationCount: 0,
          acceptedCount: null,
        },
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("classifies overlapping legacy rows without exact run identity as ambiguous and excludes them", () => {
    const directory = mkdtempSync(join(tmpdir(), "production-day-x-"));
    const dbPath = join(directory, "scweet_state.db");

    try {
      createSchema(dbPath);
      insertOverlappingRuns(dbPath);
      insertAccounts(dbPath);
      insertEvent(dbPath, {
        id: "legacy-overlap",
        eventType: "pass_succeeded",
        occurredAt: "2026-07-21T00:01:00.000Z",
        collectorRunId: null,
        requestId: "legacy-request",
        scanJobId: "legacy-scan",
        accountId: 1,
        passObservationId: "legacy-pass",
        attributionStatus: "known",
        requestsBefore: 0,
        requestsAfter: 50,
        tweetsBefore: 0,
        tweetsAfter: 50,
        fetchedCount: 50,
        acceptedCount: 50,
      });

      const pool = buildXAccountPoolReport({
        ledgerPath: dbPath,
        collectionDate,
        observedAt: new Date("2026-07-21T00:03:00.000Z"),
      });

      expect(pool).toMatchObject({
        eventCount: 0,
        targetRunEventCorrelationStatus: "ambiguous",
        ambiguousTargetRunEventCount: 1,
        attributionStatus: "unknown",
        totalRequestDelta: null,
        totalTweetDelta: null,
        totalReturnedCount: null,
        passSucceededCount: null,
        passFailedCount: null,
      });
      expect(pool.accounts[0]).toMatchObject({
        attributionStatus: "unknown",
        fetchedCount: null,
        acceptedCount: null,
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("keeps null-run-id pass and budget companions through an exact request anchor", () => {
    const directory = mkdtempSync(join(tmpdir(), "production-day-x-"));
    const dbPath = join(directory, "scweet_state.db");

    try {
      createSchema(dbPath);
      insertOverlappingRuns(dbPath);
      insertAccounts(dbPath);
      insertEvent(dbPath, {
        id: "target-terminal",
        eventType: "pass_succeeded",
        occurredAt: "2026-07-21T00:01:00.000Z",
        collectorRunId: "run-target-date",
        requestId: "request-target",
        scanJobId: "scan-target",
        accountId: 1,
        passObservationId: "pass-target",
        attributionStatus: "known",
        requestsBefore: 0,
        requestsAfter: 1,
        tweetsBefore: 0,
        tweetsAfter: 4,
        fetchedCount: 4,
        acceptedCount: 4,
      });
      insertEvent(dbPath, {
        id: "target-pass-started",
        eventType: "pass_started",
        occurredAt: "2026-07-21T00:00:59.000Z",
        collectorRunId: null,
        requestId: "request-target",
        scanJobId: "scan-target",
        accountId: null,
        passObservationId: "pass-target",
        attributionStatus: "unknown",
        estimatedRequestCost: 3,
        requestsBefore: 0,
        requestsAfter: 0,
        tweetsBefore: 0,
        tweetsAfter: 0,
        fetchedCount: null,
        acceptedCount: null,
      });
      insertEvent(dbPath, {
        id: "target-budget",
        eventType: "budget_snapshot",
        occurredAt: "2026-07-21T00:00:58.000Z",
        collectorRunId: null,
        requestId: "request-target",
        scanJobId: "scan-target",
        accountId: 1,
        passObservationId: null,
        attributionStatus: "unknown",
        estimatedRequestCost: 3,
        requestsBefore: 0,
        requestsAfter: 0,
        tweetsBefore: 0,
        tweetsAfter: 0,
        fetchedCount: null,
        acceptedCount: null,
      });

      const pool = buildXAccountPoolReport({
        ledgerPath: dbPath,
        collectionDate,
        observedAt: new Date("2026-07-21T00:03:00.000Z"),
      });
      const report = productionDayReport(pool);

      expect(pool).toMatchObject({
        eventCount: 3,
        targetRunEventCorrelationStatus: "exact",
        ambiguousTargetRunEventCount: 0,
        passStartedCount: 1,
        totalEstimatedRequestCost: 6,
        attributionStatus: "known",
      });
      expect(pool.accounts[0]).toMatchObject({
        eventCount: 2,
        estimatedRequestCost: 3,
        attributionStatus: "known",
        acceptedCount: 4,
      });
      expect(report.stats).toMatchObject({
        xAccountUsageEventCount: 3,
        xAccountAttribution: {
          status: "known",
          targetRunEventCorrelationStatus: "exact",
          ambiguousTargetRunEventCount: 0,
        },
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function productionDayReport(
  pool: ReturnType<typeof buildXAccountPoolReport>,
) {
  return buildProductionDayReport({
    executionMode: "live-production",
    historicalReuseProvenance: null,
    historicalRegenerationProvenance: null,
    collectionDate,
    evidencePath: "/tmp/unused-durable-evidence.json",
    frontendFixturePath: "/tmp/unused-frontend-fixture.json",
    startedAt: new Date("2026-07-21T00:03:00.000Z"),
    completedAt: new Date("2026-07-21T00:04:00.000Z"),
    steps: [],
    scope: {
      tenantId: "11111111-1111-4111-8111-111111111111",
      workspaceId: "22222222-2222-4222-8222-222222222222",
    },
    collectionQuality: {
      collectionDate,
      dayWindowAudit: {
        publishedInsideWindowFeedItemCount: 4,
        providerBreakdown: [],
      },
      xAccountPool: pool,
    },
    durableEvidence: null,
    evidenceBinding: null,
    liveCaptureExecution: null,
    allowDegraded: false,
    allowHistorical: false,
    failure: null,
  });
}

function createSchema(dbPath: string): void {
  execSql(
    dbPath,
    `
      create table runs (
        id integer primary key, run_id text not null, status text not null,
        started_at real not null, finished_at real, query_hash text not null,
        tweets_count integer not null, input_json text, stats_json text
      );
      create table accounts (
        id integer primary key, username text not null, status integer not null,
        available_til real, busy integer not null, daily_requests integer not null,
        daily_tweets integer not null, last_reset_date text, last_used real,
        cooldown_reason text
      );
      create table account_usage_events (
        event_id text primary key, event_type text not null, provider text not null,
        occurred_at text not null, account_id integer, username text,
        request_id text not null, scan_job_id text not null, collector_run_id text,
        source_binding_id text not null, query text not null,
        pass_observation_id text, observation_relation text, pass_label text,
        product text, estimated_request_cost integer, requests_before integer,
        requests_after integer, tweets_before integer, tweets_after integer,
        fetched_count integer, accepted_count integer, returned_count integer,
        failure_kind text, cooldown_reason text, reset_at text,
        attribution_status text
      );
    `,
  );
}

function insertOverlappingRuns(dbPath: string): void {
  const targetInput = JSON.stringify({
    since: "2026-07-20",
    until: "2026-07-21",
    search_query: "AI agents",
    display_type: "Top",
  });
  const otherInput = JSON.stringify({
    since: "2026-07-19",
    until: "2026-07-20",
    search_query: "AI agents",
    display_type: "Top",
  });
  execSql(
    dbPath,
    `
      insert into runs values
        (1, 'run-target-date', 'completed', 1784592000, 1784592120,
         'target-hash', 4, ${sqlString(targetInput)}, '{}'),
        (2, 'run-other-date', 'completed', 1784592030, 1784592150,
         'other-hash', 99, ${sqlString(otherInput)}, '{}');
    `,
  );
}

function insertAccounts(dbPath: string): void {
  execSql(
    dbPath,
    `
      insert into accounts values
        (1, 'research-a', 1, null, 0, 3, 4, '2026-07-21', null, null),
        (2, 'research-b', 1, null, 0, 1, 0, '2026-07-21', null, null);
    `,
  );
}

function insertTargetEvents(dbPath: string): void {
  insertEvent(dbPath, {
    id: "known-a",
    eventType: "pass_succeeded",
    occurredAt: "2026-07-21T00:01:00.000Z",
    collectorRunId: "run-target-date",
    requestId: "request-target",
    scanJobId: "scan-target",
    accountId: 1,
    passObservationId: "pass-a-known",
    attributionStatus: "known",
    requestsBefore: 0,
    requestsAfter: 1,
    tweetsBefore: 0,
    tweetsAfter: 4,
    fetchedCount: 4,
    acceptedCount: 4,
  });
  for (const [id, eventType, fetchedCount] of [
    ["conflict-a-success", "pass_succeeded", 2],
    ["conflict-a-failure", "pass_failed", null],
  ] as const) {
    insertEvent(dbPath, {
      id,
      eventType,
      occurredAt: "2026-07-21T00:01:05.000Z",
      collectorRunId: "run-target-date",
      requestId: "request-target",
      scanJobId: "scan-target",
      accountId: 1,
      passObservationId: "pass-a-conflict",
      attributionStatus: "known",
      requestsBefore: 1,
      requestsAfter: 2,
      tweetsBefore: 4,
      tweetsAfter: 6,
      fetchedCount,
      acceptedCount: fetchedCount,
    });
  }
  insertEvent(dbPath, {
    id: "state-b",
    eventType: "account_state_delta_observed",
    occurredAt: "2026-07-21T00:01:10.000Z",
    collectorRunId: "run-target-date",
    requestId: "request-target",
    scanJobId: "scan-target",
    accountId: 2,
    passObservationId: "pass-b",
    attributionStatus: "unknown",
    requestsBefore: 0,
    requestsAfter: 1,
    tweetsBefore: 0,
    tweetsAfter: 0,
    fetchedCount: null,
    acceptedCount: null,
    observationRelation: "overlaps_pass_observation_window",
  });
}

type EventFixture = {
  readonly id: string;
  readonly eventType: string;
  readonly occurredAt: string;
  readonly collectorRunId: string | null;
  readonly requestId: string;
  readonly scanJobId: string;
  readonly accountId: number | null;
  readonly passObservationId: string | null;
  readonly attributionStatus: string;
  readonly estimatedRequestCost?: number | null;
  readonly requestsBefore: number;
  readonly requestsAfter: number;
  readonly tweetsBefore: number;
  readonly tweetsAfter: number;
  readonly fetchedCount: number | null;
  readonly acceptedCount: number | null;
  readonly observationRelation?: string | null;
};

function insertEvent(dbPath: string, event: EventFixture): void {
  execSql(
    dbPath,
    `
      insert into account_usage_events (
        event_id, event_type, provider, occurred_at, account_id, username,
        request_id, scan_job_id, collector_run_id, source_binding_id, query,
        pass_observation_id, observation_relation, pass_label, product,
        estimated_request_cost,
        requests_before, requests_after, tweets_before, tweets_after,
        fetched_count, accepted_count, attribution_status
      ) values (
        ${sqlString(event.id)}, ${sqlString(event.eventType)}, 'x-twitter',
        ${sqlString(event.occurredAt)}, ${event.accountId ?? "null"},
        ${
          event.accountId === null
            ? "null"
            : sqlString(`research-${event.accountId}`)
        },
        ${sqlString(event.requestId)}, ${sqlString(event.scanJobId)},
        ${sqlNullableString(event.collectorRunId)}, 'binding-1', 'AI agents',
        ${sqlNullableString(event.passObservationId)},
        ${sqlNullableString(event.observationRelation ?? null)},
        'top_base', 'search', ${event.estimatedRequestCost ?? "null"},
        ${event.requestsBefore}, ${event.requestsAfter},
        ${event.tweetsBefore}, ${event.tweetsAfter},
        ${event.fetchedCount ?? "null"}, ${event.acceptedCount ?? "null"},
        ${sqlString(event.attributionStatus)}
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

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlNullableString(value: string | null): string {
  return value === null ? "null" : sqlString(value);
}
