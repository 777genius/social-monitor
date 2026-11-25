export type CheckPublicApiRateLimitCommand = {
  readonly subjectKey: string;
  readonly operation: string;
  readonly limit: number;
  readonly windowSeconds: number;
};
