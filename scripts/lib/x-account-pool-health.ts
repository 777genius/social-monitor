export type XAccountIneligibilityReason =
  | "state_unavailable"
  | "status_not_reusable"
  | "busy"
  | "cooldown_active"
  | "daily_request_limit_reached"
  | "daily_tweet_limit_reached";

type XAccountHealthState = {
  readonly stateAvailable: boolean;
  readonly status: number | null;
  readonly busy: boolean | null;
  readonly dailyRequests: number | null;
  readonly dailyTweets: number | null;
  readonly dailyRequestsLimit: number | null;
  readonly dailyTweetsLimit: number | null;
  readonly lastResetDate: string | null;
  readonly cooldownUntil: string | null;
};

const reusableXAccountStatuses = new Set([1, 401, 403, 404]);

export function evaluateXAccountHealth(
  state: XAccountHealthState,
  observedAt: Date,
) {
  const reasons: XAccountIneligibilityReason[] = [];
  if (!state.stateAvailable) {
    reasons.push("state_unavailable");
  }
  if (state.status === null || !reusableXAccountStatuses.has(state.status)) {
    reasons.push("status_not_reusable");
  }
  if (state.busy === true) {
    reasons.push("busy");
  }
  const cooldownUntil = parseTimestamp(state.cooldownUntil);
  if (cooldownUntil !== null && cooldownUntil > observedAt.getTime()) {
    reasons.push("cooldown_active");
  }

  const usageIsCurrent =
    state.lastResetDate === observedAt.toISOString().slice(0, 10);
  const dailyRequests = usageIsCurrent ? state.dailyRequests : 0;
  const dailyTweets = usageIsCurrent ? state.dailyTweets : 0;
  if (limitReached(dailyRequests, state.dailyRequestsLimit)) {
    reasons.push("daily_request_limit_reached");
  }
  if (limitReached(dailyTweets, state.dailyTweetsLimit)) {
    reasons.push("daily_tweet_limit_reached");
  }

  return {
    eligible: reasons.length === 0,
    ineligibilityReasonCodes: reasons,
  } as const;
}

function limitReached(value: number | null, limit: number | null): boolean {
  return value !== null && limit !== null && value >= limit;
}

function parseTimestamp(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const normalized = value.includes("T")
    ? value
    : `${value.replace(" ", "T")}Z`;
  const parsed = Date.parse(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}
