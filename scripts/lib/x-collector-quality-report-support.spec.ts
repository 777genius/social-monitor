import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildXAccountPoolReport,
  buildXCollectorLedgerReport,
} from "./x-collector-quality-report-support";
import { finalizeXAccountAttributionWarningOnly } from "./x-account-attribution-warning-policy";
import {
  createLedgerTables,
  epochSeconds,
  execSql,
  insertEvent,
  insertRun,
  insertUnrelatedHistory,
  sqliteTestExecFileSync,
  sqlString,
} from "./x-collector-quality-report-sqlite-test-support";

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
  beforeAll(() => {
    jest
      .mocked(execFileSync)
      .mockImplementation(sqliteTestExecFileSync);
  });

  it("reads the ledger in read-only mode and counts target search windows", () => {
    const directory = mkdtempSync(join(tmpdir(), "x-collector-quality-"));
    const dbPath = join(directory, "scweet_state.db");

    try {
      createLedgerTables({ dbPath, accounts: true, events: true });
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
        requestId: "run-4",
      });
      insertEvent({
        dbPath,
        id: "event-old-target-date-failure",
        type: "pass_failed",
        occurredAt: "2026-07-07T12:00:00.000Z",
        accountId: 1,
        fetched: null,
        accepted: null,
        requestId: "run-4",
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
      expect(accountPool.attributionStatus).toBe("unknown");
      expect(accountPool.totalRequestDelta).toBeNull();
      expect(accountPool.totalTweetDelta).toBeNull();
      expect(accountPool.targetWindowAttribution).toMatchObject({
        fetchedCount: 31,
        acceptedCount: 9,
      });
      expect(accountPool.attributionPolicy).toBe("warning_only");
      expect(accountPool.attributionGateReason).toBe(
        "unknown_attribution_global_collection_succeeded_warning_only",
      );
      expect(accountPool.accounts[0]?.passStartedCount).toBe(1);
      expect(accountPool.accounts[0]?.fetchedCount).toBeNull();
      expect(accountPool.accounts[0]?.targetWindowAttribution.status).toBe(
        "unknown",
      );
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
        expect(args[2]).toBe(dbPath);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("uses the target UTC window instead of run execution date", () => {
    const directory = mkdtempSync(join(tmpdir(), "x-collector-quality-"));
    const dbPath = join(directory, "scweet_state.db");

    try {
      createLedgerTables({ dbPath });
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
      createLedgerTables({ dbPath });
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
      createLedgerTables({
        dbPath,
        accounts: true,
        events: true,
        eventOptionalColumns: [
          "daily_requests_limit",
          "daily_tweets_limit",
          "account_priority",
        ],
      });
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
            'run-1', 'scan-1', 'binding-1',
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

  it("distinguishes total accounts from accounts eligible to collect", () => {
    const directory = mkdtempSync(join(tmpdir(), "x-collector-quality-"));
    const dbPath = join(directory, "scweet_state.db");

    try {
      createLedgerTables({
        dbPath,
        accounts: true,
        events: true,
        eventOptionalColumns: ["attribution_status"],
      });
      insertRun({
        dbPath,
        id: 1,
        displayType: "Top",
        startedAt: "2026-07-14T00:01:00Z",
        finishedAt: "2026-07-14T00:02:00Z",
        tweets: 1,
        since: "2026-07-13",
        until: "2026-07-14",
      });
      execSql(
        dbPath,
        `
          insert into accounts (
            id, username, status, available_til, busy, daily_requests,
            daily_tweets, last_reset_date, last_used, cooldown_reason
          ) values
            (1, 'active_account', 1, null, 0, 1, 10, '2026-07-14', null, null),
            (2, 'manually_disabled_account', 0, null, 0, 0, 0, '2026-07-14', null, null);
          insert into account_usage_events (
            event_id, event_type, provider, occurred_at, account_id, username,
            request_id, scan_job_id, source_binding_id, query, pass_label,
            product, requests_before, requests_after, tweets_before,
            tweets_after, fetched_count, accepted_count, attribution_status
          ) values (
            'event-known', 'pass_succeeded', 'x-twitter',
            '2026-07-14T00:01:30.000Z', 1, 'active_account', 'run-1',
            'scan-1', 'binding-1', 'AI agents', 'top_base', 'search',
            0, 1, 0, 0, 0, 0, 'known'
          );
        `,
      );

      const accountPool = buildXAccountPoolReport({
        ledgerPath: dbPath,
        collectionDate: "2026-07-13",
        observedAt: new Date("2026-07-14T00:03:00.000Z"),
      });

      expect(accountPool).toMatchObject({
        accountCount: 2,
        totalAccountCount: 2,
        eligibleAccountCount: 1,
        ineligibleAccountCount: 1,
        observedAt: "2026-07-14T00:03:00.000Z",
        attributionStatus: "known",
        totalRequestDelta: 1,
        totalTweetDelta: 0,
        attributionPolicy: "warning_only",
        attributionGateReason:
          "known_attribution_zero_output_warning_only",
        eligibleAccountZeroAttributableOutputWarningCount: 1,
      });
      expect(
        accountPool.accounts.find((account) => account.status === 1),
      ).toMatchObject({
        eligible: true,
        ineligibilityReasonCodes: [],
        observedAccountSnapshot: {
          counterResetDate: "2026-07-14",
          counterResetDateMatchesTargetDate: false,
        },
        targetWindowAttribution: {
          collectionDate: "2026-07-13",
          status: "known",
          requestDelta: 1,
          acceptedCount: 0,
        },
      });
      expect(
        accountPool.accounts.find((account) => account.status === 0),
      ).toMatchObject({
        eligible: false,
        ineligibilityReasonCodes: ["status_not_reusable"],
      });
      const verdict = finalizeXAccountAttributionWarningOnly({
        qualityGates: { globalXCollectionSucceeded: true },
        attribution: accountPool,
      });
      expect(verdict.collectionBlockingPassed).toBe(true);
      expect(verdict.operationalWarnings).toMatchObject({
        xAccountAttributionStatus: "known",
        xAccountAttributionWarningCount: 1,
        xAccountAttributionWarnings: [
          {
            code: "eligible_account_requests_without_attributable_output",
          },
        ],
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("derives reused-account deltas without duplicating pass or rate counts", () => {
    const directory = mkdtempSync(join(tmpdir(), "x-collector-quality-"));
    const dbPath = join(directory, "scweet_state.db");

    try {
      createLedgerTables({
        dbPath,
        accounts: true,
        events: true,
        eventOptionalColumns: [
          "pass_observation_id",
          "observation_relation",
          "attribution_status",
        ],
      });
      insertRun({
        dbPath,
        id: 1,
        displayType: "Top",
        startedAt: "2026-07-14T00:01:00Z",
        finishedAt: "2026-07-14T00:02:00Z",
        tweets: 2,
        since: "2026-07-13",
        until: "2026-07-14",
      });
      execSql(
        dbPath,
        `
          insert into accounts (
            id, username, status, available_til, busy, daily_requests,
            daily_tweets, last_reset_date, last_used, cooldown_reason
          ) values (
            1, 'reused_account', 1, null, 0, 2, 2,
            '2026-07-14', null, 'rate_limit'
          );
          insert into account_usage_events (
            event_id, event_type, provider, occurred_at, pass_observation_id,
            observation_relation, account_id, username, request_id,
            scan_job_id, source_binding_id,
            query, pass_label, product, requests_before, requests_after,
            tweets_before, tweets_after, fetched_count, accepted_count,
            failure_kind, cooldown_reason, attribution_status
          ) values
            ('result-1', 'pass_succeeded', 'x-twitter',
             '2026-07-14T00:01:10.000Z', 'pass-1', null, null, null, 'run-1',
             'scan-1', 'binding-1', 'AI agents', 'top_base', 'search',
             null, null, null, null, 2, 2, null, null, 'unknown'),
            ('state-delta-1', 'account_state_delta_observed', 'x-twitter',
             '2026-07-14T00:01:10.000Z', 'pass-1',
             'overlaps_pass_observation_window', 1, 'reused_account',
             'run-1', 'scan-1', 'binding-1', 'AI agents', 'top_base',
             'search', 0, 1, 0, 2, null, null, null, null, 'unknown'),
            ('result-2', 'pass_failed', 'x-twitter',
             '2026-07-14T00:01:20.000Z', 'pass-2', null, null, null, 'run-1',
             'scan-1', 'binding-1', 'AI agents', 'latest_base', 'search',
             null, null, null, null, null, null, 'rate_limited', null, 'unknown'),
            ('state-delta-2', 'account_state_delta_observed', 'x-twitter',
             '2026-07-14T00:01:20.000Z', 'pass-2',
             'overlaps_pass_observation_window', 1, 'reused_account',
             'run-1', 'scan-1', 'binding-1', 'AI agents', 'latest_base',
             'search', 1, 2, 2, 2, null, null, null, null, 'unknown'),
            ('cooldown-2', 'cooldown_observed', 'x-twitter',
             '2026-07-14T00:01:20.000Z', 'pass-2',
             'overlaps_pass_observation_window', 1, 'reused_account',
             'run-1', 'scan-1', 'binding-1', 'AI agents', 'latest_base',
             'search', null, null, null, null, null, null, 'rate_limited',
             'rate_limit', null);
        `,
      );

      const accountPool = buildXAccountPoolReport({
        ledgerPath: dbPath,
        collectionDate: "2026-07-13",
        observedAt: new Date("2026-07-14T00:03:00.000Z"),
      });

      expect(accountPool).toMatchObject({
        passSucceededCount: 1,
        passFailedCount: 1,
        rateLimitCount: 1,
        rateLimitObservationStatus: "unambiguous",
        ambiguousLegacyRateLimitEventCount: 0,
        totalRequestDelta: 2,
        totalTweetDelta: 2,
        attributionStatus: "unknown",
        attributionPolicy: "warning_only",
        attributionGateReason:
          "unknown_attribution_global_collection_succeeded_warning_only",
        targetWindowAttribution: {
          stateDeltaObservationStatus: "monotonic_lower_bound",
          stateDeltaBasis: "non_overlapping_counter_range_envelope",
          fetchedCount: 2,
          acceptedCount: 2,
          knownPassResultCount: 0,
          unknownPassResultCount: 2,
        },
      });
      expect(accountPool.accounts[0]).toMatchObject({
        requestDelta: 2,
        tweetDelta: 2,
        fetchedCount: null,
        acceptedCount: null,
        passSucceededCount: null,
        passFailedCount: null,
        rateLimitCount: 1,
        rateLimitObservationStatus: "unambiguous",
        warningCodes: [],
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("bounds SQLite output despite 12k unrelated runs and events", () => {
    const directory = mkdtempSync(join(tmpdir(), "x-collector-quality-"));
    const dbPath = join(directory, "scweet_state.db");

    try {
      createLedgerTables({ dbPath, accounts: true, events: true });
      insertRun({
        dbPath,
        id: 1,
        displayType: "Top",
        startedAt: "2026-07-26T00:10:00.000Z",
        finishedAt: "2026-07-26T00:11:00.000Z",
        tweets: 31,
        since: "2026-07-25",
        until: "2026-07-26",
      });
      insertRun({
        dbPath,
        id: 2,
        displayType: "Latest",
        startedAt: "2026-07-26T00:12:00.000Z",
        finishedAt: "2026-07-26T00:13:00.000Z",
        tweets: 1,
        since: "2026-07-25",
        until: "2026-07-26",
        statsJson: "{malformed",
      });
      insertRun({
        dbPath,
        id: 3,
        displayType: "Top",
        startedAt: "2026-07-26T00:14:00.000Z",
        finishedAt: "2026-07-26T00:15:00.000Z",
        tweets: 999,
        inputJson: "{malformed",
      });
      execSql(
        dbPath,
        `
          insert into accounts (
            id, username, status, available_til, busy, daily_requests,
            daily_tweets, last_reset_date, last_used, cooldown_reason
          ) values (
            1, 'bounded_account', 1, null, 0, 1, 31,
            '2026-07-26', null, null
          );
        `,
      );
      insertEvent({
        dbPath,
        id: "target-event",
        type: "pass_succeeded",
        occurredAt: "2026-07-26T00:10:30.000Z",
        accountId: 1,
        fetched: 31,
        accepted: 31,
      });
      insertUnrelatedHistory(dbPath);

      jest.mocked(execFileSync).mockClear();
      const ledger = buildXCollectorLedgerReport({
        ledgerPath: dbPath,
        collectionDate: "2026-07-25",
      });
      const accountPool = buildXAccountPoolReport({
        ledgerPath: dbPath,
        collectionDate: "2026-07-25",
        observedAt: new Date("2026-07-26T00:20:00.000Z"),
      });

      expect(ledger).toMatchObject({
        available: true,
        runCount: 2,
        returnedTweetCount: 32,
        invalidJsonFieldCount: 1,
        invalidJsonFields: [
          {
            runId: "run-2",
            field: "stats_json",
          },
        ],
        readError: null,
      });
      expect(accountPool).toMatchObject({
        eventCount: 1,
        targetRunEventCorrelationStatus: "exact",
        ambiguousTargetRunEventCount: 0,
        readError: null,
      });
      const readSql = jest
        .mocked(execFileSync)
        .mock.calls.map(([, args]) => (Array.isArray(args) ? args[3] : ""))
        .filter((value): value is string => typeof value === "string");
      expect(readSql.some((sql) => sql.includes("json_valid(input_json)"))).toBe(
        true,
      );
      expect(
        readSql.some((sql) => sql.includes("target_correlation_keys")),
      ).toBe(true);
      for (const [command, args] of jest.mocked(execFileSync).mock.calls) {
        expect(command).toBe("sqlite3");
        expect(Array.isArray(args) ? args.slice(0, 2) : args).toEqual([
          "-readonly",
          "-json",
        ]);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("uses half-open UTC overlap at one millisecond and rejects SQL input", () => {
    const directory = mkdtempSync(join(tmpdir(), "x-collector-quality-"));
    const dbPath = join(directory, "scweet_state.db");

    try {
      createLedgerTables({ dbPath });
      insertRun({
        dbPath,
        id: 1,
        displayType: "Top",
        startedAt: "2026-07-26T01:00:00.000Z",
        finishedAt: "2026-07-26T01:01:00.000Z",
        tweets: 1,
        since: "2026-07-25T23:59:59.999Z",
        until: "2026-07-26T00:00:00.000Z",
      });
      insertRun({
        dbPath,
        id: 2,
        displayType: "Latest",
        startedAt: "2026-07-26T01:02:00.000Z",
        finishedAt: "2026-07-26T01:03:00.000Z",
        tweets: 2,
        since: "2026-07-24T23:59:59.999Z",
        until: "2026-07-25T00:00:00.001Z",
      });
      insertRun({
        dbPath,
        id: 3,
        displayType: "Top",
        startedAt: "2026-07-26T01:04:00.000Z",
        finishedAt: "2026-07-26T01:05:00.000Z",
        tweets: 100,
        since: "2026-07-26T00:00:00.000Z",
        until: "2026-07-26T00:00:00.001Z",
      });
      insertRun({
        dbPath,
        id: 4,
        displayType: "Top",
        startedAt: "2026-07-26T01:06:00.000Z",
        finishedAt: "2026-07-26T01:07:00.000Z",
        tweets: 100,
        since: "2026-07-24T23:59:59.999Z",
        until: "2026-07-25T00:00:00.000Z",
      });

      const ledger = buildXCollectorLedgerReport({
        ledgerPath: dbPath,
        collectionDate: "2026-07-25",
      });
      expect(ledger).toMatchObject({
        runCount: 2,
        returnedTweetCount: 3,
        hasTopAndLatest: true,
      });

      jest.mocked(execFileSync).mockClear();
      const rejected = buildXCollectorLedgerReport({
        ledgerPath: dbPath,
        collectionDate: "2026-07-25' OR 1=1 --",
      });
      expect(rejected).toMatchObject({
        available: true,
        runCount: 0,
        returnedTweetCount: 0,
        readError: null,
      });
      const rejectedSql = jest.mocked(execFileSync).mock.calls[0]?.[1]?.[3];
      expect(rejectedSql).not.toContain("OR 1=1");
      expect(rejectedSql).toContain("where 0");
      expect(rejectedSql).toContain(
        "order by started_at asc, run_id asc",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("loads exact correlation keys and inclusive bounded event edges only", () => {
    const directory = mkdtempSync(join(tmpdir(), "x-collector-quality-"));
    const dbPath = join(directory, "scweet_state.db");
    const targetRunId = "target-' OR 1=1 --";

    try {
      createLedgerTables({
        dbPath,
        accounts: true,
        events: true,
        eventOptionalColumns: ["collector_run_id"],
      });
      insertRun({
        dbPath,
        id: 1,
        runId: targetRunId,
        displayType: "Top",
        startedAt: "2026-07-26T00:10:00.500Z",
        finishedAt: "2026-07-26T00:20:00.500Z",
        tweets: 1,
        since: "2026-07-25",
        until: "2026-07-26",
      });
      execSql(
        dbPath,
        `
          insert into accounts (
            id, username, status, available_til, busy, daily_requests,
            daily_tweets, last_reset_date, last_used, cooldown_reason
          ) values (
            1, 'correlated_account', 1, null, 0, 1, 1,
            '2026-07-26', null, null
          );
          insert into account_usage_events (
            event_id, event_type, provider, occurred_at, collector_run_id,
            account_id, username, request_id, scan_job_id, source_binding_id,
            query, pass_label, product, fetched_count, accepted_count
          ) values
            ('exact-anchor', 'pass_started', 'x-twitter',
             '2026-07-27T00:00:00.000Z', null, null, null,
             ${sqlString(targetRunId)}, 'target-scan', 'binding-1',
             'target', 'top_base', 'search', null, null),
            ('exact-related', 'pass_succeeded', 'x-twitter',
             '2026-07-27T00:00:01.000Z', null, 1, 'correlated_account',
             ${sqlString(targetRunId)}, 'target-scan', 'binding-1',
             'target', 'top_base', 'search', 1, 1),
            ('edge-start', 'budget_snapshot', 'x-twitter',
             '2026-07-26T00:05:00.500Z', null, 1, 'correlated_account',
             'legacy-start', 'legacy-scan', 'binding-1',
             'legacy', null, null, null, null),
            ('edge-before', 'budget_snapshot', 'x-twitter',
             '2026-07-26T00:05:00.499Z', null, 1, 'correlated_account',
             'legacy-before', 'legacy-scan', 'binding-1',
             'legacy', null, null, null, null),
            ('edge-end', 'budget_snapshot', 'x-twitter',
             '2026-07-26T00:25:00.500Z', null, 1, 'correlated_account',
             'legacy-end', 'legacy-scan', 'binding-1',
             'legacy', null, null, null, null),
            ('edge-after', 'budget_snapshot', 'x-twitter',
             '2026-07-26T00:25:00.501Z', null, 1, 'correlated_account',
             'legacy-after', 'legacy-scan', 'binding-1',
             'legacy', null, null, null, null),
            ('foreign-explicit', 'pass_succeeded', 'x-twitter',
             '2026-07-26T00:10:01.000Z', 'foreign-run', 1,
             'correlated_account', ${sqlString(targetRunId)}, 'target-scan',
             'binding-1', 'foreign', 'top_base', 'search', 99, 99);
        `,
      );

      jest.mocked(execFileSync).mockClear();
      const accountPool = buildXAccountPoolReport({
        ledgerPath: dbPath,
        collectionDate: "2026-07-25",
        observedAt: new Date("2026-07-27T00:01:00.000Z"),
      });

      expect(accountPool).toMatchObject({
        eventCount: 2,
        targetRunEventCorrelationStatus: "ambiguous",
        ambiguousTargetRunEventCount: 2,
        passStartedCount: 1,
        passSucceededCount: 1,
        targetWindowAttribution: {
          acceptedCount: 1,
        },
      });
      const eventSql = jest
        .mocked(execFileSync)
        .mock.calls.map(([, args]) => (Array.isArray(args) ? args[3] : ""))
        .find((sql) => sql?.includes("target_correlation_keys"));
      expect(eventSql).toContain("target-'' OR 1=1 --");
      expect(eventSql).toContain(
        "order by occurred_at asc, event_id asc",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
