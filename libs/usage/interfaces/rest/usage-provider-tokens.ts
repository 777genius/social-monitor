import { assertRuntimeProfileAllowsMode } from '@social-monitor/platform-config';

import type { PublicApiAuditLogPort, RateLimitCounterPort, UsageQuotaLedgerPort } from '../../ports';

export type UsagePersistenceMode = 'in-memory' | 'prisma';

export const USAGE_PERSISTENCE_MODE = Symbol('USAGE_PERSISTENCE_MODE');
export const USAGE_PRISMA_CLIENT = Symbol('USAGE_PRISMA_CLIENT');
export const USAGE_PUBLIC_API_AUDIT_LOG = Symbol('USAGE_PUBLIC_API_AUDIT_LOG');
export const USAGE_RATE_LIMIT_COUNTER = Symbol('USAGE_RATE_LIMIT_COUNTER');
export const USAGE_QUOTA_LEDGER = Symbol('USAGE_QUOTA_LEDGER');

export type UsageProviderTokenMap = {
  readonly [USAGE_PERSISTENCE_MODE]: UsagePersistenceMode;
  readonly [USAGE_PRISMA_CLIENT]: unknown;
  readonly [USAGE_PUBLIC_API_AUDIT_LOG]: PublicApiAuditLogPort;
  readonly [USAGE_RATE_LIMIT_COUNTER]: RateLimitCounterPort;
  readonly [USAGE_QUOTA_LEDGER]: UsageQuotaLedgerPort;
};

export const resolveUsagePersistenceMode = (env: NodeJS.ProcessEnv): UsagePersistenceMode => {
  const value = env.USAGE_PERSISTENCE ?? 'in-memory';

  if (value === 'in-memory') {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: 'USAGE_PERSISTENCE',
      selectedMode: value,
      durableModes: ['prisma'],
    });

    return 'in-memory';
  }

  if (value === 'prisma') {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: 'USAGE_PERSISTENCE',
      selectedMode: value,
      durableModes: ['prisma'],
    });

    if ((env.DATABASE_URL ?? '').trim().length === 0) {
      throw new Error('USAGE_PERSISTENCE=prisma requires DATABASE_URL');
    }

    return 'prisma';
  }

  throw new Error('USAGE_PERSISTENCE must be "in-memory" or "prisma"');
};
