import { PrismaPg } from '@prisma/adapter-pg';
import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';
import { Pool } from 'pg';

import type { PrismaSummaryClient } from './prisma-summary-client';

type PrismaSummaryRuntimeClient = PrismaSummaryClient & {
  $disconnect(): Promise<void>;
};

type PrismaSummaryRuntimeClientConstructor = new (args: {
  readonly adapter: PrismaPg;
}) => PrismaSummaryRuntimeClient;

export class PrismaSummaryConnection implements PrismaSummaryClient {
  readonly $queryRaw: PrismaSummaryClient['$queryRaw'];
  readonly summaryJob: PrismaSummaryClient['summaryJob'];
  readonly summaryArtifact: PrismaSummaryClient['summaryArtifact'];
  readonly summaryFeedback: PrismaSummaryClient['summaryFeedback'];
  readonly summaryPolicy: PrismaSummaryClient['summaryPolicy'];
  readonly briefingJob: PrismaSummaryClient['briefingJob'];
  readonly briefingArtifact: PrismaSummaryClient['briefingArtifact'];
  readonly briefingPolicy: PrismaSummaryClient['briefingPolicy'];
  readonly outboxEvent: PrismaSummaryClient['outboxEvent'];

  private readonly pool: Pool;
  private readonly client: PrismaSummaryRuntimeClient;

  constructor(databaseUrl: string) {
    if (databaseUrl.trim().length === 0) {
      throw new Error('DATABASE_URL is required for Prisma summary persistence');
    }

    this.pool = new Pool({ connectionString: databaseUrl });
    const PrismaClient = loadPrismaRuntimeClient<PrismaSummaryRuntimeClientConstructor>();
    this.client = new PrismaClient({ adapter: new PrismaPg(this.pool) });

    this.summaryJob = this.client.summaryJob;
    this.summaryArtifact = this.client.summaryArtifact;
    this.summaryFeedback = this.client.summaryFeedback;
    this.summaryPolicy = this.client.summaryPolicy;
    this.briefingJob = this.client.briefingJob;
    this.briefingArtifact = this.client.briefingArtifact;
    this.briefingPolicy = this.client.briefingPolicy;
    this.outboxEvent = this.client.outboxEvent;
    this.$queryRaw = this.client.$queryRaw.bind(this.client) as PrismaSummaryClient['$queryRaw'];
  }

  async close(): Promise<void> {
    await this.client.$disconnect();
    await this.pool.end();
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
