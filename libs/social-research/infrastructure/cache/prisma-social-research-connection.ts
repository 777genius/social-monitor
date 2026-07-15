import { PrismaPg } from '@prisma/adapter-pg';
import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';
import { Pool } from 'pg';

import type { PrismaSocialResearchResultCacheClient } from './prisma-social-research-client';

type PrismaSocialResearchRuntimeClient =
  PrismaSocialResearchResultCacheClient & {
    $disconnect(): Promise<void>;
  };

type PrismaSocialResearchRuntimeClientConstructor = new (args: {
  readonly adapter: PrismaPg;
}) => PrismaSocialResearchRuntimeClient;

export class PrismaSocialResearchConnection
  implements PrismaSocialResearchResultCacheClient
{
  readonly $queryRaw: PrismaSocialResearchResultCacheClient['$queryRaw'];
  readonly $executeRaw: PrismaSocialResearchResultCacheClient['$executeRaw'];

  private readonly pool: Pool;
  private readonly client: PrismaSocialResearchRuntimeClient;

  constructor(databaseUrl: string) {
    if (databaseUrl.trim().length === 0) {
      throw new Error('DATABASE_URL is required for Prisma social research cache');
    }

    this.pool = new Pool({ connectionString: databaseUrl });
    const PrismaClient =
      loadPrismaRuntimeClient<PrismaSocialResearchRuntimeClientConstructor>();
    this.client = new PrismaClient({ adapter: new PrismaPg(this.pool) });
    this.$queryRaw = this.client.$queryRaw.bind(
      this.client,
    ) as PrismaSocialResearchResultCacheClient['$queryRaw'];
    this.$executeRaw = this.client.$executeRaw.bind(
      this.client,
    ) as PrismaSocialResearchResultCacheClient['$executeRaw'];
  }

  async close(): Promise<void> {
    await this.client.$disconnect();
    await this.pool.end();
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
