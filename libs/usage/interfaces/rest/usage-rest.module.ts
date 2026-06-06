import { Module } from '@nestjs/common';
import { SystemClock } from '@social-monitor/shared-kernel';

import { InMemoryRateLimitCounter } from '../../adapters/rate-limit/in-memory-rate-limit-counter';
import { CheckPublicApiRateLimitUseCase } from '../../features/check-public-api-rate-limit/check-public-api-rate-limit.use-case';

@Module({
  providers: [
    InMemoryRateLimitCounter,
    {
      provide: CheckPublicApiRateLimitUseCase,
      useFactory: (counters: InMemoryRateLimitCounter) =>
        new CheckPublicApiRateLimitUseCase(counters, new SystemClock()),
      inject: [InMemoryRateLimitCounter],
    },
  ],
  exports: [CheckPublicApiRateLimitUseCase, InMemoryRateLimitCounter],
})
export class UsageRestModule {}
