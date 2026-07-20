import {
  buildXAccountAttributionSummary,
  buildXAccountReport,
  type XAccountStateRow,
  type XAccountUsageEventRow,
} from "./x-account-attribution-report";

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
      status: "partial",
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
      fetchedCount: 9,
      acceptedCount: 9,
      knownPassResultCount: 1,
      unknownPassResultCount: 1,
      attributionPolicy: "warning_only",
      gateReason: "partial_attribution_global_collection_succeeded_warning_only",
    });
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
