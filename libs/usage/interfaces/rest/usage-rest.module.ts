import { Module } from '@nestjs/common';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';

import { InMemoryPublicApiAuditLog } from '../../adapters/audit/in-memory-public-api-audit-log';
import { InMemoryRateLimitCounter } from '../../adapters/rate-limit/in-memory-rate-limit-counter';
import { CheckPublicApiRateLimitUseCase } from '../../features/check-public-api-rate-limit/check-public-api-rate-limit.use-case';
import { RecordPublicApiAuditEventUseCase } from '../../features/record-public-api-audit-event/record-public-api-audit-event.use-case';

@Module({
  providers: [
    InMemoryPublicApiAuditLog,
    InMemoryRateLimitCounter,
    {
      provide: CheckPublicApiRateLimitUseCase,
      useFactory: (counters: InMemoryRateLimitCounter) =>
        new CheckPublicApiRateLimitUseCase(counters, new SystemClock()),
      inject: [InMemoryRateLimitCounter],
    },
    {
      provide: RecordPublicApiAuditEventUseCase,
      useFactory: (auditLog: InMemoryPublicApiAuditLog) =>
        new RecordPublicApiAuditEventUseCase(auditLog, new CryptoIdGenerator(), new SystemClock()),
      inject: [InMemoryPublicApiAuditLog],
    },
  ],
  exports: [
    CheckPublicApiRateLimitUseCase,
    InMemoryPublicApiAuditLog,
    InMemoryRateLimitCounter,
    RecordPublicApiAuditEventUseCase,
  ],
})
export class UsageRestModule {}
