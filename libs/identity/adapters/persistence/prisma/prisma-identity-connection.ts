import { PrismaPg } from '@prisma/adapter-pg';
import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';
import { Pool } from 'pg';

import type { PrismaIdentityClient } from './prisma-identity-client';

type PrismaIdentityRuntimeClient = PrismaIdentityClient & {
  $disconnect(): Promise<void>;
};

type PrismaIdentityRuntimeClientConstructor = new (args: {
  readonly adapter: PrismaPg;
}) => PrismaIdentityRuntimeClient;

export class PrismaIdentityConnection implements PrismaIdentityClient {
  readonly apiKeyCredential: PrismaIdentityClient['apiKeyCredential'];
  readonly membership: PrismaIdentityClient['membership'];

  private readonly pool: Pool;
  private readonly client: PrismaIdentityRuntimeClient;

  constructor(databaseUrl: string) {
    if (databaseUrl.trim().length === 0) {
      throw new Error('DATABASE_URL is required for Prisma identity persistence');
    }

    this.pool = new Pool({ connectionString: databaseUrl });
    const PrismaClient = loadPrismaRuntimeClient<PrismaIdentityRuntimeClientConstructor>();
    this.client = new PrismaClient({ adapter: new PrismaPg(this.pool) });

    this.apiKeyCredential = this.client.apiKeyCredential;
    this.membership = this.client.membership;
  }

  async close(): Promise<void> {
    await this.client.$disconnect();
    await this.pool.end();
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
