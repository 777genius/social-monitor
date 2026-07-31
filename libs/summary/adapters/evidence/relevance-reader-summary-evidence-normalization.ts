export const isInsidePeriod = (
  date: Date,
  period: Readonly<{ startedAt: Date; endedAt: Date }>,
): boolean =>
  date.getTime() >= period.startedAt.getTime() &&
  date.getTime() < period.endedAt.getTime();

export const inclusiveObservedAfter = (startedAt: Date): Date =>
  new Date(startedAt.getTime() - 1);

export const inclusiveObservedBefore = (endedAt: Date): Date =>
  new Date(endedAt.getTime() + 1);

export const providerBalancedQuotaForLimit = (params: {
  readonly limit: number;
  readonly activeProviderCount: number;
}): number => {
  if (params.activeProviderCount <= 0) {
    return params.limit;
  }

  return Math.max(1, Math.floor(params.limit / params.activeProviderCount));
};

export const normalizeProviderKey = (providerKey: string): string =>
  providerKey.trim().toLocaleLowerCase("en-US");

export const isHackerNewsCanonicalUrl = (
  value: string | undefined,
): boolean => {
  if (value === undefined) {
    return false;
  }

  try {
    return new URL(value).hostname.toLowerCase() === "news.ycombinator.com";
  } catch {
    return false;
  }
};

export const roundScore = (value: number): number =>
  Math.round(value * 1000) / 1000;
