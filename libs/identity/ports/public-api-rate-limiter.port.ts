import type { DomainError, Result } from '@social-monitor/shared-kernel';

export type CheckIdentityPublicApiRateLimitCommand = {
  readonly subjectKey: string;
  readonly operation: string;
  readonly limit: number;
  readonly windowSeconds: number;
};

export type IdentityPublicApiRateLimitDecision = {
  readonly allowed: true;
  readonly limit: number;
  readonly remaining: number;
  readonly resetAt: string;
};

export interface PublicApiRateLimiterPort {
  check(
    command: CheckIdentityPublicApiRateLimitCommand,
  ): Promise<Result<IdentityPublicApiRateLimitDecision, DomainError>>;
}
