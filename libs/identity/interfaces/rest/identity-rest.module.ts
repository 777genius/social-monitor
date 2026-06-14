import { Module } from '@nestjs/common';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';
import { UsageRestModule } from '@social-monitor/usage/interfaces/rest/usage-rest.module';

import { Sha256ApiKeyHasher } from '../../adapters/hash/hmac-api-key.hasher';
import { InMemoryApiKeyRepository } from '../../adapters/persistence/in-memory-api-key.repository';
import { PrismaApiKeyRepository } from '../../adapters/persistence/prisma/prisma-api-key.repository';
import type { PrismaIdentityClient } from '../../adapters/persistence/prisma/prisma-identity-client';
import { PrismaIdentityConnection } from '../../adapters/persistence/prisma/prisma-identity-connection';
import { CreateApiKeyUseCase } from '../../features/create-api-key/create-api-key.use-case';
import { ListApiKeysUseCase } from '../../features/list-api-keys/list-api-keys.use-case';
import { RevokeApiKeyUseCase } from '../../features/revoke-api-key/revoke-api-key.use-case';
import { VerifyApiKeyUseCase } from '../../features/verify-api-key/verify-api-key.use-case';
import type { ApiKeyRepositoryPort } from '../../ports';
import { IdentityAuthorizationModule } from '../authorization/identity-authorization.module';
import { ApiKeysController } from './api-keys.controller';
import {
  IDENTITY_API_KEY_REPOSITORY,
  IDENTITY_PERSISTENCE_MODE,
  IDENTITY_PRISMA_CLIENT,
  resolveIdentityPersistenceMode,
  type IdentityPersistenceMode,
} from './identity-provider-tokens';

@Module({
  imports: [UsageRestModule, IdentityAuthorizationModule],
  controllers: [ApiKeysController],
  providers: [
    {
      provide: IDENTITY_PERSISTENCE_MODE,
      useFactory: () => resolveIdentityPersistenceMode(process.env),
    },
    {
      provide: IDENTITY_PRISMA_CLIENT,
      useFactory: (mode: IdentityPersistenceMode): PrismaIdentityClient | null =>
        mode === 'prisma' ? new PrismaIdentityConnection(process.env.DATABASE_URL ?? '') : null,
      inject: [IDENTITY_PERSISTENCE_MODE],
    },
    InMemoryApiKeyRepository,
    {
      provide: IDENTITY_API_KEY_REPOSITORY,
      useFactory: (
        mode: IdentityPersistenceMode,
        prisma: PrismaIdentityClient | null,
        inMemoryApiKeys: InMemoryApiKeyRepository,
      ): ApiKeyRepositoryPort =>
        mode === 'prisma'
          ? new PrismaApiKeyRepository(requirePrismaIdentityClient(prisma))
          : inMemoryApiKeys,
      inject: [IDENTITY_PERSISTENCE_MODE, IDENTITY_PRISMA_CLIENT, InMemoryApiKeyRepository],
    },
    Sha256ApiKeyHasher,
    {
      provide: CreateApiKeyUseCase,
      useFactory: (apiKeys: ApiKeyRepositoryPort, hasher: Sha256ApiKeyHasher) =>
        new CreateApiKeyUseCase(apiKeys, hasher, new CryptoIdGenerator(), new SystemClock()),
      inject: [IDENTITY_API_KEY_REPOSITORY, Sha256ApiKeyHasher],
    },
    {
      provide: VerifyApiKeyUseCase,
      useFactory: (apiKeys: ApiKeyRepositoryPort, hasher: Sha256ApiKeyHasher) =>
        new VerifyApiKeyUseCase(apiKeys, hasher),
      inject: [IDENTITY_API_KEY_REPOSITORY, Sha256ApiKeyHasher],
    },
    {
      provide: ListApiKeysUseCase,
      useFactory: (apiKeys: ApiKeyRepositoryPort) => new ListApiKeysUseCase(apiKeys),
      inject: [IDENTITY_API_KEY_REPOSITORY],
    },
    {
      provide: RevokeApiKeyUseCase,
      useFactory: (apiKeys: ApiKeyRepositoryPort) =>
        new RevokeApiKeyUseCase(apiKeys, new SystemClock()),
      inject: [IDENTITY_API_KEY_REPOSITORY],
    },
  ],
  exports: [
    CreateApiKeyUseCase,
    IDENTITY_API_KEY_REPOSITORY,
    InMemoryApiKeyRepository,
    ListApiKeysUseCase,
    RevokeApiKeyUseCase,
    Sha256ApiKeyHasher,
    VerifyApiKeyUseCase,
    IdentityAuthorizationModule,
  ],
})
export class IdentityRestModule {}

const requirePrismaIdentityClient = (client: PrismaIdentityClient | null): PrismaIdentityClient => {
  if (client === null) {
    throw new Error('Prisma identity client is required when IDENTITY_PERSISTENCE=prisma');
  }

  return client;
};
