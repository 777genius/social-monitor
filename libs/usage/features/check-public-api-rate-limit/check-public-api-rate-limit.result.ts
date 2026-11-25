export type CheckPublicApiRateLimitResult = {
  readonly allowed: true;
  readonly limit: number;
  readonly remaining: number;
  readonly resetAt: string;
};
