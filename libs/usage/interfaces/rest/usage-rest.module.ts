import { Module } from '@nestjs/common';
import { IdentityAuthorizationModule } from '@social-monitor/identity/interfaces/authorization/identity-authorization.module';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';

import { InMemoryPublicApiAuditLog } from '../../adapters/audit/in-memory-public-api-audit-log';
import { PrismaPublicApiAuditLog } from '../../adapters/persistence/prisma/prisma-public-api-audit-log';
import { PrismaRateLimitCounter } from '../../adapters/persistence/prisma/prisma-rate-limit-counter';
import { PrismaUsageConnection } from '../../adapters/persistence/prisma/prisma-usage-connection';
import type { PrismaUsageClient } from '../../adapters/persistence/prisma/prisma-usage-client';
import { PrismaUsageQuotaLedger } from '../../adapters/persistence/prisma/prisma-usage-quota-ledger';
import { InMemoryUsageQuotaLedger } from '../../adapters/quota/in-memory-usage-quota-ledger';
import { InMemoryRateLimitCounter } from '../../adapters/rate-limit/in-memory-rate-limit-counter';
import { CheckPublicApiRateLimitUseCase } from '../../features/check-public-api-rate-limit/check-public-api-rate-limit.use-case';
import { ListPublicApiAuditEventsUseCase } from '../../features/list-public-api-audit-events/list-public-api-audit-events.use-case';
import { RecordPublicApiAuditEventUseCase } from '../../features/record-public-api-audit-event/record-public-api-audit-event.use-case';
import { ReserveUsageQuotaUseCase } from '../../features/reserve-usage-quota/reserve-usage-quota.use-case';
import type { PublicApiAuditLogPort, RateLimitCounterPort, UsageQuotaLedgerPort } from '../../ports';
import {
  USAGE_PERSISTENCE_MODE,
  USAGE_PRISMA_CLIENT,
  USAGE_PUBLIC_API_AUDIT_LOG,
  USAGE_QUOTA_LEDGER,
  USAGE_RATE_LIMIT_COUNTER,
  resolveUsagePersistenceMode,
  type UsagePersistenceMode,
} from './usage-provider-tokens';
import { PublicApiAuditEventsController } from './public-api-audit-events.controller';

@Module({
  imports: [IdentityAuthorizationModule],
  controllers: [PublicApiAuditEventsController],
  providers: [
    {
      provide: USAGE_PERSISTENCE_MODE,
      useFactory: () => resolveUsagePersistenceMode(process.env),
    },
    {
      provide: USAGE_PRISMA_CLIENT,
      useFactory: (mode: UsagePersistenceMode): PrismaUsageClient | null =>
        mode === 'prisma' ? new PrismaUsageConnection(process.env.DATABASE_URL ?? '') : null,
      inject: [USAGE_PERSISTENCE_MODE],
    },
    InMemoryPublicApiAuditLog,
    InMemoryRateLimitCounter,
    InMemoryUsageQuotaLedger,
    {
      provide: USAGE_PUBLIC_API_AUDIT_LOG,
      useFactory: (
        mode: UsagePersistenceMode,
        prisma: PrismaUsageClient | null,
        inMemoryAuditLog: InMemoryPublicApiAuditLog,
      ): PublicApiAuditLogPort =>
        mode === 'prisma'
          ? new PrismaPublicApiAuditLog(requirePrismaUsageClient(prisma))
          : inMemoryAuditLog,
      inject: [USAGE_PERSISTENCE_MODE, USAGE_PRISMA_CLIENT, InMemoryPublicApiAuditLog],
    },
    {
      provide: USAGE_RATE_LIMIT_COUNTER,
      useFactory: (
        mode: UsagePersistenceMode,
        prisma: PrismaUsageClient | null,
        inMemoryCounters: InMemoryRateLimitCounter,
      ): RateLimitCounterPort =>
        mode === 'prisma'
          ? new PrismaRateLimitCounter(requirePrismaUsageClient(prisma))
          : inMemoryCounters,
      inject: [USAGE_PERSISTENCE_MODE, USAGE_PRISMA_CLIENT, InMemoryRateLimitCounter],
    },
    {
      provide: USAGE_QUOTA_LEDGER,
      useFactory: (
        mode: UsagePersistenceMode,
        prisma: PrismaUsageClient | null,
        inMemoryLedger: InMemoryUsageQuotaLedger,
      ): UsageQuotaLedgerPort =>
        mode === 'prisma'
          ? new PrismaUsageQuotaLedger(requirePrismaUsageClient(prisma))
          : inMemoryLedger,
      inject: [USAGE_PERSISTENCE_MODE, USAGE_PRISMA_CLIENT, InMemoryUsageQuotaLedger],
    },
    {
      provide: CheckPublicApiRateLimitUseCase,
      useFactory: (counters: RateLimitCounterPort) =>
        new CheckPublicApiRateLimitUseCase(counters, new SystemClock()),
      inject: [USAGE_RATE_LIMIT_COUNTER],
    },
    {
      provide: RecordPublicApiAuditEventUseCase,
      useFactory: (auditLog: PublicApiAuditLogPort) =>
        new RecordPublicApiAuditEventUseCase(auditLog, new CryptoIdGenerator(), new SystemClock()),
      inject: [USAGE_PUBLIC_API_AUDIT_LOG],
    },
    {
      provide: ListPublicApiAuditEventsUseCase,
      useFactory: (auditLog: PublicApiAuditLogPort) => new ListPublicApiAuditEventsUseCase(auditLog),
      inject: [USAGE_PUBLIC_API_AUDIT_LOG],
    },
    {
      provide: ReserveUsageQuotaUseCase,
      useFactory: (ledger: UsageQuotaLedgerPort) =>
        new ReserveUsageQuotaUseCase(ledger, new SystemClock()),
      inject: [USAGE_QUOTA_LEDGER],
    },
  ],
  exports: [
    CheckPublicApiRateLimitUseCase,
    InMemoryPublicApiAuditLog,
    InMemoryRateLimitCounter,
    InMemoryUsageQuotaLedger,
    ListPublicApiAuditEventsUseCase,
    RecordPublicApiAuditEventUseCase,
    ReserveUsageQuotaUseCase,
    USAGE_PUBLIC_API_AUDIT_LOG,
    USAGE_RATE_LIMIT_COUNTER,
    USAGE_QUOTA_LEDGER,
  ],
})
export class UsageRestModule {}

const requirePrismaUsageClient = (client: PrismaUsageClient | null): PrismaUsageClient => {
  if (client === null) {
    throw new Error('Prisma usage client is required when USAGE_PERSISTENCE=prisma');
  }

  return client;
};
