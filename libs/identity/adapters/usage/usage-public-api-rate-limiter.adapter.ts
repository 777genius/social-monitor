import type { CheckPublicApiRateLimitUseCase } from '@social-monitor/usage/features/check-public-api-rate-limit/check-public-api-rate-limit.use-case';

import type {
  CheckIdentityPublicApiRateLimitCommand,
  PublicApiRateLimiterPort,
} from '../../ports';

type RateLimitWorkflow = Pick<CheckPublicApiRateLimitUseCase, 'execute'>;

export class UsagePublicApiRateLimiterAdapter
  implements PublicApiRateLimiterPort
{
  constructor(private readonly workflow: RateLimitWorkflow) {}

  check(
    command: CheckIdentityPublicApiRateLimitCommand,
  ): ReturnType<PublicApiRateLimiterPort['check']> {
    return this.workflow.execute(command);
  }
}
