import {
  buildXAccountAttributionSummary,
  buildXAccountReport,
  countXRateLimitObservations,
  summarizeXRateLimitObservations,
  type XAccountStateRow,
  type XAccountUsageEventRow,
} from "./x-account-attribution-report";
import {
  correlateXAccountEventsToTargetRuns,
} from "./x-target-run-event-correlation";

describe("X account attribution reporting", () => {
  it("separates post-midnight snapshots from target-window deltas", () => {
    const observedAt = new Date("2026-07-18T00:05:00.000Z");
    const events = [knownResult(1, 2, 7)];
    const account = buildXAccountReport({
      accountKey: "id:1",
      state: accountState(1, 11, 40, "2026-07-18"),
      events,
      allEvents: events,
      collectionDate: "2026-07-17",
      observedAt,
    });

    expect(account.observedAccountSnapshot).toEqual({
      observedAt: observedAt.toISOString(),
      dailyRequests: 11,
      dailyTweets: 40,
      counterResetDate: "2026-07-18",
      counterResetDateMatchesTargetDate: false,
    });
    expect(account.targetWindowAttribution).toMatchObject({
      collectionDate: "2026-07-17",
      status: "known",
      requestDelta: 2,
      tweetDelta: 7,
      acceptedCount: 7,
    });
  });

  it("counts each known pass once and warns on eligible zero output", () => {
    const observedAt = new Date("2026-07-18T00:05:00.000Z");
    const events = [knownResult(1, 1, 5), knownResult(2, 24, 0)];
    const accounts = [
      buildXAccountReport({
        accountKey: "id:1",
        state: accountState(1, 1, 5, "2026-07-18"),
        events: [events[0] as XAccountUsageEventRow],
        allEvents: events,
        collectionDate: "2026-07-17",
        observedAt,
      }),
      buildXAccountReport({
        accountKey: "id:2",
        state: accountState(2, 24, 0, "2026-07-18"),
        events: [events[1] as XAccountUsageEventRow],
        allEvents: events,
        collectionDate: "2026-07-17",
        observedAt,
      }),
    ];
    const summary = buildXAccountAttributionSummary({
      collectionDate: "2026-07-17",
      events,
      accounts,
      globalCollectionSucceeded: true,
    });

    expect(summary).toMatchObject({
      status: "known",
      requestDelta: 25,
      tweetDelta: 5,
      fetchedCount: 5,
      acceptedCount: 5,
      knownPassResultCount: 2,
      unknownPassResultCount: 0,
      eligibleAccountZeroAttributableOutputWarningCount: 1,
      attributionPolicy: "warning_only",
      gateReason: "known_attribution_zero_output_warning_only",
    });
    expect(accounts[1]?.warningCodes).toEqual([
      "eligible_account_requests_without_attributable_output",
    ]);
  });

  it("keeps attribution and terminal status local to each account", () => {
    const observedAt = new Date("2026-07-18T00:05:00.000Z");
    const accountAKnown = knownResult(1, 1, 4);
    const accountBStateOnly = stateDeltaObservation("pass-b", 2, 1, 0);
    const allEvents = [accountAKnown, accountBStateOnly];
    const accountA = buildXAccountReport({
      accountKey: "id:1",
      state: accountState(1, 1, 4, "2026-07-18"),
      events: [accountAKnown],
      allEvents,
      collectionDate: "2026-07-17",
      observedAt,
    });
    const accountB = buildXAccountReport({
      accountKey: "id:2",
      state: accountState(2, 1, 0, "2026-07-18"),
      events: [accountBStateOnly],
      allEvents,
      collectionDate: "2026-07-17",
      observedAt,
    });

    expect(accountA.targetWindowAttribution).toMatchObject({
      status: "known",
      terminalObservationStatus: "unambiguous",
      ambiguousPassObservationCount: 0,
      acceptedCount: 4,
    });
    expect(accountB).toMatchObject({
      attributionStatus: "unknown",
      terminalObservationStatus: "unambiguous",
      ambiguousPassObservationCount: 0,
      fetchedCount: null,
      acceptedCount: null,
      warningCodes: [],
      targetWindowAttribution: {
        status: "unknown",
        requestDelta: 1,
        acceptedCount: null,
      },
    });
  });

  it("excludes a foreign run that reuses the target request and scan key", () => {
    const target = {
      event_id: "target-terminal",
      event_type: "pass_succeeded",
      occurred_at: "2026-07-21T00:01:00.000Z",
      collector_run_id: "run-target",
      request_id: "reused-request",
      scan_job_id: "reused-scan",
      fetched_count: 4,
      accepted_count: 4,
    } satisfies XAccountUsageEventRow;
    const foreign = {
      ...target,
      event_id: "foreign-terminal",
      collector_run_id: "run-foreign",
      fetched_count: 99,
      accepted_count: 99,
    } satisfies XAccountUsageEventRow;

    const result = correlateXAccountEventsToTargetRuns({
      events: [target, foreign],
      targetRunIds: ["run-target"],
      legacyWindows: [
        {
          startedAt: Date.parse("2026-07-21T00:00:00.000Z"),
          finishedAt: Date.parse("2026-07-21T00:02:00.000Z"),
        },
      ],
    });

    expect(result.rows).toEqual([target]);
    expect(result.correlation).toEqual({
      status: "exact",
      ambiguousEventCount: 0,
    });
  });

  it("keeps unknown attribution nullable and non-blocking after global success", () => {
    const observedAt = new Date("2026-07-18T00:05:00.000Z");
    const events = [unknownResult()];
    const accounts = [
      buildXAccountReport({
        accountKey: "id:1",
        state: accountState(1, 24, 0, "2026-07-18"),
        events: [],
        allEvents: events,
        collectionDate: "2026-07-17",
        observedAt,
      }),
    ];
    const summary = buildXAccountAttributionSummary({
      collectionDate: "2026-07-17",
      events,
      accounts,
      globalCollectionSucceeded: true,
    });

    expect(accounts[0]?.targetWindowAttribution).toMatchObject({
      status: "unknown",
      requestDelta: null,
      tweetDelta: null,
      fetchedCount: null,
      acceptedCount: null,
    });
    expect(accounts[0]?.warningCodes).toEqual([]);
    expect(summary).toMatchObject({
      status: "unknown",
      requestDelta: null,
      tweetDelta: null,
      fetchedCount: 12,
      acceptedCount: 5,
      passSucceededCount: 1,
      passFailedCount: 0,
      eligibleAccountZeroAttributableOutputWarningCount: 0,
      attributionPolicy: "warning_only",
      gateReason: "unknown_attribution_global_collection_succeeded_warning_only",
    });
  });

  it("preserves known lower bounds and explicit partial semantics", () => {
    const observedAt = new Date("2026-07-18T00:05:00.000Z");
    const events = [knownResult(1, 3, 9), unknownResult()];
    const account = buildXAccountReport({
      accountKey: "id:1",
      state: accountState(1, 3, 9, "2026-07-18"),
      events: [events[0] as XAccountUsageEventRow],
      allEvents: events,
      collectionDate: "2026-07-17",
      observedAt,
    });
    const summary = buildXAccountAttributionSummary({
      collectionDate: "2026-07-17",
      events,
      accounts: [account],
      globalCollectionSucceeded: true,
    });

    expect(account.targetWindowAttribution).toMatchObject({
      status: "known",
      requestDelta: 3,
      tweetDelta: 9,
      fetchedCount: 9,
      acceptedCount: 9,
      passSucceededCount: 1,
    });
    expect(account.warningCodes).toEqual([]);
    expect(summary).toMatchObject({
      status: "partial",
      requestDelta: 3,
      tweetDelta: 9,
      fetchedCount: 21,
      acceptedCount: 14,
      passSucceededCount: 2,
      knownPassResultCount: 1,
      unknownPassResultCount: 1,
      attributionPolicy: "warning_only",
      gateReason: "partial_attribution_global_collection_succeeded_warning_only",
    });
  });

  it("keeps aggregate output once while reporting two observed account deltas", () => {
    const observedAt = new Date("2026-07-18T00:05:00.000Z");
    const result = unknownPassResult("pass-1", "pass_succeeded", 3, 2);
    const accountOneDelta = stateDeltaObservation("pass-1", 1, 1, 2);
    const accountTwoDelta = stateDeltaObservation("pass-1", 2, 1, 1);
    const events = [
      result,
      accountOneDelta,
      accountTwoDelta,
    ];
    const accounts = [
      buildXAccountReport({
        accountKey: "id:1",
        state: accountState(1, 1, 2, "2026-07-18"),
        events: [accountOneDelta],
        allEvents: events,
        collectionDate: "2026-07-17",
        observedAt,
      }),
      buildXAccountReport({
        accountKey: "id:2",
        state: accountState(2, 1, 1, "2026-07-18"),
        events: [accountTwoDelta],
        allEvents: events,
        collectionDate: "2026-07-17",
        observedAt,
      }),
    ];
    const summary = buildXAccountAttributionSummary({
      collectionDate: "2026-07-17",
      events,
      accounts,
      globalCollectionSucceeded: true,
    });

    expect(summary).toMatchObject({
      status: "unknown",
      requestDelta: 2,
      tweetDelta: 3,
      fetchedCount: 3,
      acceptedCount: 2,
      passSucceededCount: 1,
      passFailedCount: 0,
      knownPassResultCount: 0,
      unknownPassResultCount: 1,
      attributionPolicy: "warning_only",
    });
    expect(accounts[0]?.targetWindowAttribution).toMatchObject({
      status: "unknown",
      requestDelta: 1,
      tweetDelta: 2,
      fetchedCount: null,
      acceptedCount: null,
      passSucceededCount: null,
    });
    expect(accounts[1]?.targetWindowAttribution).toMatchObject({
      status: "unknown",
      requestDelta: 1,
      tweetDelta: 1,
      fetchedCount: null,
      acceptedCount: null,
      passSucceededCount: null,
    });
  });

  it("does not double count a reused account or rate-limit cooldown", () => {
    const observedAt = new Date("2026-07-18T00:05:00.000Z");
    const firstStateDelta = stateDeltaObservation("pass-1", 1, 1, 2);
    const secondStateDelta = stateDeltaObservation(
      "pass-2",
      1,
      1,
      0,
      1,
      2,
    );
    const rateLimitCooldown: XAccountUsageEventRow = {
      event_id: "cooldown-pass-2",
      event_type: "cooldown_observed",
      pass_observation_id: "pass-2",
      account_id: 1,
      username: "research-1",
      failure_kind: "rate_limited",
      cooldown_reason: "rate_limit",
    };
    const events = [
      unknownPassResult("pass-1", "pass_succeeded", 2, 2),
      firstStateDelta,
      unknownPassResult("pass-2", "pass_failed", null, null),
      secondStateDelta,
      rateLimitCooldown,
    ];
    const account = buildXAccountReport({
      accountKey: "id:1",
      state: accountState(1, 2, 2, "2026-07-18"),
      events: [
        firstStateDelta,
        secondStateDelta,
        rateLimitCooldown,
      ],
      allEvents: events,
      collectionDate: "2026-07-17",
      observedAt,
    });
    const summary = buildXAccountAttributionSummary({
      collectionDate: "2026-07-17",
      events,
      accounts: [account],
      globalCollectionSucceeded: true,
    });

    expect(summary).toMatchObject({
      status: "unknown",
      requestDelta: 2,
      tweetDelta: 2,
      fetchedCount: 2,
      acceptedCount: 2,
      passSucceededCount: 1,
      passFailedCount: 1,
      knownPassResultCount: 0,
      unknownPassResultCount: 2,
      gateReason: "unknown_attribution_global_collection_succeeded_warning_only",
    });
    expect(account).toMatchObject({
      requestDelta: 2,
      tweetDelta: 2,
      fetchedCount: null,
      acceptedCount: null,
      passSucceededCount: null,
      passFailedCount: null,
      rateLimitCount: 1,
      warningCodes: [],
    });
    expect(countXRateLimitObservations(events)).toBe(1);
  });

  it("makes duplicate state-delta ranges idempotent", () => {
    const first = stateDeltaObservation("pass-1", 1, 1, 2);
    const duplicate = {
      ...first,
      event_id: "duplicate-state-delta-pass-1-1",
    };
    const events = [
      unknownPassResult("pass-1", "pass_succeeded", 2, 2),
      first,
      duplicate,
    ];
    const summary = buildXAccountAttributionSummary({
      collectionDate: "2026-07-17",
      events,
      accounts: [],
      globalCollectionSucceeded: true,
    });

    expect(summary).toMatchObject({
      status: "unknown",
      requestDelta: 1,
      tweetDelta: 2,
      stateDeltaObservationStatus: "monotonic_lower_bound",
      fetchedCount: 2,
      acceptedCount: 2,
      passSucceededCount: 1,
      unknownPassResultCount: 1,
      attributionPolicy: "warning_only",
    });
  });

  it("keeps legacy deltas when a window also has state observations", () => {
    const legacy = knownResult(1, 2, 7);
    const currentStateDelta = stateDeltaObservation(
      "pass-2",
      1,
      1,
      3,
      2,
      7,
    );
    const events = [
      legacy,
      unknownPassResult("pass-2", "pass_succeeded", 3, 3),
      currentStateDelta,
    ];
    const observedAt = new Date("2026-07-18T00:05:00.000Z");
    const account = buildXAccountReport({
      accountKey: "id:1",
      state: accountState(1, 3, 10, "2026-07-18"),
      events: [legacy, currentStateDelta],
      allEvents: events,
      collectionDate: "2026-07-17",
      observedAt,
    });
    const summary = buildXAccountAttributionSummary({
      collectionDate: "2026-07-17",
      events,
      accounts: [account],
      globalCollectionSucceeded: true,
    });

    expect(summary).toMatchObject({
      status: "partial",
      requestDelta: 3,
      tweetDelta: 10,
      fetchedCount: 10,
      acceptedCount: 10,
      passSucceededCount: 2,
      knownPassResultCount: 1,
      unknownPassResultCount: 1,
    });
    expect(account.targetWindowAttribution).toMatchObject({
      status: "known",
      requestDelta: 3,
      tweetDelta: 10,
      fetchedCount: 7,
      acceptedCount: 7,
      passSucceededCount: 1,
    });
  });

  it("uses the state range envelope when one duplicate has no delta", () => {
    const counted = stateDeltaObservation("pass-1", 1, 1, 2);
    const stateOnly = stateDeltaObservation("pass-1", 1, 0, 0);
    const events = [
      unknownPassResult("pass-1", "pass_succeeded", 2, 2),
      counted,
      { ...stateOnly, event_id: "state-only-duplicate" },
    ];
    const summary = buildXAccountAttributionSummary({
      collectionDate: "2026-07-17",
      events,
      accounts: [],
      globalCollectionSucceeded: true,
    });

    expect(summary).toMatchObject({
      status: "unknown",
      requestDelta: 1,
      tweetDelta: 2,
      fetchedCount: 2,
      acceptedCount: 2,
      passSucceededCount: 1,
    });
  });

  it("ignores a legacy zero-delta state observation", () => {
    const events = [
      unknownPassResult("pass-1", "pass_failed", null, null),
      stateDeltaObservation("pass-1", 1, 0, 0),
    ];
    const summary = buildXAccountAttributionSummary({
      collectionDate: "2026-07-17",
      events,
      accounts: [],
      globalCollectionSucceeded: false,
    });

    expect(summary).toMatchObject({
      status: "unknown",
      requestDelta: null,
      tweetDelta: null,
      passSucceededCount: 0,
      passFailedCount: 1,
      gateReason: "unknown_attribution_without_global_success_warning_only",
    });
  });

  it("uses a non-overlapping envelope for concurrent same-account windows", () => {
    const events = [
      unknownPassResult("pass-1", "pass_succeeded", 2, 2),
      stateDeltaObservation("pass-1", 1, 2, 2),
      unknownPassResult("pass-2", "pass_succeeded", 3, 3),
      stateDeltaObservation("pass-2", 1, 3, 3),
    ];

    const summary = buildXAccountAttributionSummary({
      collectionDate: "2026-07-17",
      events,
      accounts: [],
      globalCollectionSucceeded: true,
    });

    expect(summary).toMatchObject({
      requestDelta: 3,
      tweetDelta: 3,
      stateDeltaObservationStatus: "monotonic_lower_bound",
      stateDeltaBasis: "non_overlapping_counter_range_envelope",
      passSucceededCount: 2,
      fetchedCount: 5,
      acceptedCount: 5,
    });
  });

  it("counts identical terminal retries once", () => {
    const first = unknownPassResult("pass-1", "pass_succeeded", 3, 2);
    const events = [{ ...first, event_id: "terminal-retry" }, first];

    const summary = buildXAccountAttributionSummary({
      collectionDate: "2026-07-17",
      events,
      accounts: [],
      globalCollectionSucceeded: true,
    });

    expect(summary).toMatchObject({
      terminalObservationStatus: "unambiguous",
      ambiguousPassObservationCount: 0,
      passSucceededCount: 1,
      passFailedCount: 0,
      fetchedCount: 3,
      acceptedCount: 2,
      unknownPassResultCount: 1,
    });
  });

  it("fails conflicting success and failure terminals closed as ambiguous", () => {
    const events = [
      unknownPassResult("pass-1", "pass_succeeded", 3, 2),
      unknownPassResult("pass-1", "pass_failed", null, null),
    ];

    const summary = buildXAccountAttributionSummary({
      collectionDate: "2026-07-17",
      events,
      accounts: [],
      globalCollectionSucceeded: false,
    });

    expect(summary).toMatchObject({
      status: "unknown",
      terminalObservationStatus: "ambiguous",
      ambiguousPassObservationCount: 1,
      passSucceededCount: null,
      passFailedCount: null,
      fetchedCount: null,
      acceptedCount: null,
      knownPassResultCount: 0,
      unknownPassResultCount: 0,
      gateReason: "unknown_attribution_without_global_success_warning_only",
    });
  });

  it("fails conflicting duplicate success counts closed as ambiguous", () => {
    const first = unknownPassResult("pass-1", "pass_succeeded", 3, 2);
    const events = [
      first,
      { ...first, event_id: "conflict", fetched_count: 4 },
    ];

    const summary = buildXAccountAttributionSummary({
      collectionDate: "2026-07-17",
      events,
      accounts: [],
      globalCollectionSucceeded: true,
    });

    expect(summary).toMatchObject({
      terminalObservationStatus: "ambiguous",
      ambiguousPassObservationCount: 1,
      passSucceededCount: null,
      fetchedCount: null,
      acceptedCount: null,
    });
  });

  it("fails malformed state-delta observations closed", () => {
    const malformed = {
      ...stateDeltaObservation("pass-1", 1, 1, 1),
      requests_before: 2,
      requests_after: 1,
    };
    const summary = buildXAccountAttributionSummary({
      collectionDate: "2026-07-17",
      events: [malformed],
      accounts: [],
      globalCollectionSucceeded: true,
    });

    expect(summary).toMatchObject({
      requestDelta: null,
      tweetDelta: null,
      stateDeltaObservationStatus: "ambiguous",
      ambiguousStateDeltaObservationCount: 1,
    });
  });

  it("collapses uncorrelated legacy rate limits to one ambiguous lower bound", () => {
    const events: XAccountUsageEventRow[] = [
      {
        event_id: "legacy-failure",
        event_type: "pass_failed",
        failure_kind: "rate_limited",
      },
      {
        event_id: "legacy-cooldown",
        event_type: "cooldown_observed",
        cooldown_reason: "rate_limit",
      },
      {
        event_id: "legacy-other-failure",
        event_type: "pass_failed",
        failure_kind: "429",
      },
    ];

    expect(summarizeXRateLimitObservations(events)).toEqual({
      count: 1,
      status: "ambiguous_legacy_uncorrelated",
      ambiguousLegacyEventCount: 3,
    });
    expect(countXRateLimitObservations(events)).toBe(1);
  });
});

function accountState(
  id: number,
  dailyRequests: number,
  dailyTweets: number,
  resetDate: string,
): XAccountStateRow {
  return {
    id,
    username: `research-${id}`,
    status: 1,
    busy: 0,
    daily_requests: dailyRequests,
    daily_tweets: dailyTweets,
    last_reset_date: resetDate,
  };
}

function knownResult(
  accountId: number,
  requestDelta: number,
  acceptedCount: number,
): XAccountUsageEventRow {
  return {
    event_id: `known-${accountId}`,
    event_type: "pass_succeeded",
    account_id: accountId,
    username: `research-${accountId}`,
    attribution_status: "known",
    requests_before: 0,
    requests_after: requestDelta,
    tweets_before: 0,
    tweets_after: acceptedCount,
    fetched_count: acceptedCount,
    accepted_count: acceptedCount,
  };
}

function unknownResult(): XAccountUsageEventRow {
  return {
    event_id: "unknown-1",
    event_type: "pass_succeeded",
    account_id: null,
    username: null,
    attribution_status: "unknown",
    fetched_count: 12,
    accepted_count: 5,
  };
}

function unknownPassResult(
  passObservationId: string,
  eventType: "pass_succeeded" | "pass_failed",
  fetchedCount: number | null,
  acceptedCount: number | null,
): XAccountUsageEventRow {
  return {
    event_id: `result-${passObservationId}`,
    event_type: eventType,
    pass_observation_id: passObservationId,
    account_id: null,
    username: null,
    attribution_status: "unknown",
    fetched_count: fetchedCount,
    accepted_count: acceptedCount,
    failure_kind: eventType === "pass_failed" ? "rate_limited" : null,
  };
}

function stateDeltaObservation(
  passObservationId: string,
  accountId: number,
  requestDelta: number,
  tweetDelta: number,
  requestsBefore = 0,
  tweetsBefore = 0,
): XAccountUsageEventRow {
  return {
    event_id: `state-delta-${passObservationId}-${accountId}`,
    event_type: "account_state_delta_observed",
    pass_observation_id: passObservationId,
    observation_relation: "overlaps_pass_observation_window",
    account_id: accountId,
    username: `research-${accountId}`,
    attribution_status: "unknown",
    requests_before: requestsBefore,
    requests_after: requestsBefore + requestDelta,
    tweets_before: tweetsBefore,
    tweets_after: tweetsBefore + tweetDelta,
  };
}
