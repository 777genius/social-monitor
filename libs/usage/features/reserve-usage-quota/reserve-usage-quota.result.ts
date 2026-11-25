export type ReserveUsageQuotaUseCaseResult = {
  readonly allowed: true;
  readonly amount: number;
  readonly limit: number;
  readonly consumed: number;
  readonly remaining: number;
  readonly resetAt: string;
};
