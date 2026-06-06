export type IncrementRateLimitCounterCommand = {
  readonly bucketKey: string;
  readonly windowStartedAt: Date;
  readonly windowEndsAt: Date;
};

export type IncrementRateLimitCounterResult = {
  readonly count: number;
};

export interface RateLimitCounterPort {
  increment(command: IncrementRateLimitCounterCommand): Promise<IncrementRateLimitCounterResult>;
}
