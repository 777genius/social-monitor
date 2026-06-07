import { Module } from '@nestjs/common';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';

import { InMemoryPublicApiAuditLog } from '../../adapters/audit/in-memory-public-api-audit-log';
import { InMemoryUsageQuotaLedger } from '../../adapters/quota/in-memory-usage-quota-ledger';
import { InMemoryRateLimitCounter } from '../../adapters/rate-limit/in-memory-rate-limit-counter';
import { CheckPublicApiRateLimitUseCase } from '../../features/check-public-api-rate-limit/check-public-api-rate-limit.use-case';
import { RecordPublicApiAuditEventUseCase } from '../../features/record-public-api-audit-event/record-public-api-audit-event.use-case';
import { ReserveUsageQuotaUseCase } from '../../features/reserve-usage-quota/reserve-usage-quota.use-case';

@Module({
  providers: [
    InMemoryPublicApiAuditLog,
    InMemoryRateLimitCounter,
    InMemoryUsageQuotaLedger,
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
    {
      provide: ReserveUsageQuotaUseCase,
      useFactory: (ledger: InMemoryUsageQuotaLedger) =>
        new ReserveUsageQuotaUseCase(ledger, new SystemClock()),
      inject: [InMemoryUsageQuotaLedger],
    },
  ],
  exports: [
    CheckPublicApiRateLimitUseCase,
    InMemoryPublicApiAuditLog,
    InMemoryRateLimitCounter,
    InMemoryUsageQuotaLedger,
    RecordPublicApiAuditEventUseCase,
    ReserveUsageQuotaUseCase,
  ],
})
export class UsageRestModule {}
