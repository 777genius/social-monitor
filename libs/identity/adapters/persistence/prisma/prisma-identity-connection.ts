import {
  createPrismaPgRuntimeConnection,
  type PostgresRuntimePoolConfig,
  type PrismaPgRuntimeClientConstructor,
  type PrismaPgRuntimeConnectionLease,
} from '@social-monitor/platform-persistence';
import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';

import type { PrismaIdentityClient } from './prisma-identity-client';

type PrismaIdentityRuntimeClient = PrismaIdentityClient & {
  $disconnect(): Promise<void>;
};

export class PrismaIdentityConnection implements PrismaIdentityClient {
  readonly apiKeyCredential: PrismaIdentityClient['apiKeyCredential'];
  readonly membership: PrismaIdentityClient['membership'];

  private readonly runtime: PrismaPgRuntimeConnectionLease<PrismaIdentityRuntimeClient>;
  private readonly client: PrismaIdentityRuntimeClient;

  static create(
    config: PostgresRuntimePoolConfig,
  ): Promise<PrismaIdentityConnection> {
    const PrismaClient = loadPrismaRuntimeClient<
      PrismaPgRuntimeClientConstructor<PrismaIdentityRuntimeClient>
    >();
    return createPrismaPgRuntimeConnection(
      config,
      PrismaClient,
      (runtime) => new PrismaIdentityConnection(runtime),
    );
  }

  private constructor(
    runtime: PrismaPgRuntimeConnectionLease<PrismaIdentityRuntimeClient>,
  ) {
    this.runtime = runtime;
    this.client = this.runtime.client;

    this.apiKeyCredential = this.client.apiKeyCredential;
    this.membership = this.client.membership;
  }

  close(): Promise<void> {
    return this.runtime.close();
  }

  onApplicationShutdown(): Promise<void> {
    return this.close();
  }
}
