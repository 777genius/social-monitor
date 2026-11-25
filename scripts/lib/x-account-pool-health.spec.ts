import { evaluateXAccountHealth } from "./x-account-pool-health";

const OBSERVED_AT = new Date("2026-07-14T12:00:00.000Z");

describe("X account pool health", () => {
  it("keeps an active account with capacity eligible", () => {
    expect(evaluateXAccountHealth(activeState(), OBSERVED_AT)).toEqual({
      eligible: true,
      ineligibilityReasonCodes: [],
    });
  });

  it("does not count a manually disabled account as eligible", () => {
    expect(
      evaluateXAccountHealth(activeState({ status: 0 }), OBSERVED_AT),
    ).toEqual({
      eligible: false,
      ineligibilityReasonCodes: ["status_not_reusable"],
    });
  });

  it.each([401, 403, 404])(
    "matches the collector's reusable status policy for status %s",
    (status) => {
      expect(
        evaluateXAccountHealth(activeState({ status }), OBSERVED_AT),
      ).toEqual({
        eligible: true,
        ineligibilityReasonCodes: [],
      });
    },
  );

  it("reports every observable reason that blocks collection", () => {
    expect(
      evaluateXAccountHealth(
        activeState({
          busy: true,
          cooldownUntil: "2026-07-14 13:00:00",
          dailyRequests: 30,
          dailyTweets: 600,
        }),
        OBSERVED_AT,
      ),
    ).toEqual({
      eligible: false,
      ineligibilityReasonCodes: [
        "busy",
        "cooldown_active",
        "daily_request_limit_reached",
        "daily_tweet_limit_reached",
      ],
    });
  });

  it("does not apply stale daily counters to today's capacity", () => {
    expect(
      evaluateXAccountHealth(
        activeState({
          dailyRequests: 30,
          dailyTweets: 600,
          lastResetDate: "2026-07-13",
        }),
        OBSERVED_AT,
      ),
    ).toEqual({
      eligible: true,
      ineligibilityReasonCodes: [],
    });
  });
});

function activeState(
  overrides: Partial<Parameters<typeof evaluateXAccountHealth>[0]> = {},
): Parameters<typeof evaluateXAccountHealth>[0] {
  return {
    stateAvailable: true,
    status: 1,
    busy: false,
    dailyRequests: 1,
    dailyTweets: 10,
    dailyRequestsLimit: 30,
    dailyTweetsLimit: 600,
    lastResetDate: "2026-07-14",
    cooldownUntil: null,
    ...overrides,
  };
}
