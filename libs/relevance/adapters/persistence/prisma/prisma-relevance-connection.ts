import { PrismaPg } from '@prisma/adapter-pg';
import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';
import { Pool } from 'pg';

import type {
  PrismaRelevanceClient,
  PrismaRelevanceTransactionClient,
  PrismaRelevanceTransactionOptions,
} from './prisma-relevance-client';

type PrismaRelevanceRuntimeClient = PrismaRelevanceClient & {
  $disconnect(): Promise<void>;
};

type PrismaRelevanceRuntimeClientConstructor = new (args: {
  readonly adapter: PrismaPg;
}) => PrismaRelevanceRuntimeClient;

export class PrismaRelevanceConnection implements PrismaRelevanceClient {
  readonly userRelevanceProfile: PrismaRelevanceClient['userRelevanceProfile'];
  readonly relevanceFeedbackSignal: PrismaRelevanceClient['relevanceFeedbackSignal'];
  readonly relevanceMemoryProjection: PrismaRelevanceClient['relevanceMemoryProjection'];

  private readonly pool: Pool;
  private readonly client: PrismaRelevanceRuntimeClient;

  constructor(databaseUrl: string) {
    if (databaseUrl.trim().length === 0) {
      throw new Error('DATABASE_URL is required for Prisma relevance persistence');
    }

    this.pool = new Pool({ connectionString: databaseUrl });
    const PrismaClient = loadPrismaRuntimeClient<PrismaRelevanceRuntimeClientConstructor>();
    this.client = new PrismaClient({ adapter: new PrismaPg(this.pool) });
    this.userRelevanceProfile = this.client.userRelevanceProfile;
    this.relevanceFeedbackSignal = this.client.relevanceFeedbackSignal;
    this.relevanceMemoryProjection = this.client.relevanceMemoryProjection;
  }

  async $transaction<TValue>(
    operation: (client: PrismaRelevanceTransactionClient) => Promise<TValue>,
    options?: PrismaRelevanceTransactionOptions,
  ): Promise<TValue> {
    return this.client.$transaction(
      (client) => operation(client as PrismaRelevanceTransactionClient),
      options,
    );
  }

  async close(): Promise<void> {
    await this.client.$disconnect();
    await this.pool.end();
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
