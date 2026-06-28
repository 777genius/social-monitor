import { Module } from '@nestjs/common';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';
import { UsageRestModule } from '@social-monitor/usage/interfaces/rest/usage-rest.module';

import { Sha256ApiKeyHasher } from '../../adapters/hash/hmac-api-key.hasher';
import { InMemoryApiKeyRepository } from '../../adapters/persistence/in-memory-api-key.repository';
import { PrismaApiKeyRepository } from '../../adapters/persistence/prisma/prisma-api-key.repository';
import type { PrismaIdentityClient } from '../../adapters/persistence/prisma/prisma-identity-client';
import { CreateApiKeyUseCase } from '../../features/create-api-key/create-api-key.use-case';
import { GetAuthSessionUseCase } from '../../features/get-auth-session/get-auth-session.use-case';
import { ListApiKeysUseCase } from '../../features/list-api-keys/list-api-keys.use-case';
import { RevokeApiKeyUseCase } from '../../features/revoke-api-key/revoke-api-key.use-case';
import { VerifyApiKeyUseCase } from '../../features/verify-api-key/verify-api-key.use-case';
import {
  type ApiKeyRepositoryPort,
  USER_ACCESS_TOKEN_VERIFIER,
  USER_WORKSPACE_MEMBERSHIP_VERIFIER,
  type UserAccessTokenVerifierPort,
  type UserWorkspaceMembershipVerifierPort,
} from '../../ports';
import {
  IdentityUserAuthModule,
  requirePrismaIdentityClient,
} from '../authorization/identity-user-auth.module';
import { ApiKeyRequestAuthorizer } from './api-key-request-authorizer';
import { ApiKeysController } from './api-keys.controller';
import { AuthSessionController } from './auth-session.controller';
import {
  IDENTITY_API_KEY_REPOSITORY,
  IDENTITY_PUBLIC_API_RATE_LIMIT_PER_MINUTE,
  IDENTITY_PERSISTENCE_MODE,
  IDENTITY_PRISMA_CLIENT,
  resolvePublicApiRateLimitPerMinute,
  type IdentityPersistenceMode,
} from './identity-provider-tokens';

@Module({
  imports: [UsageRestModule, IdentityUserAuthModule],
  controllers: [ApiKeysController, AuthSessionController],
  providers: [
    {
      provide: IDENTITY_PUBLIC_API_RATE_LIMIT_PER_MINUTE,
      useFactory: () => resolvePublicApiRateLimitPerMinute(process.env),
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
    {
      provide: GetAuthSessionUseCase,
      useFactory: (
        userAccessTokens: UserAccessTokenVerifierPort,
        workspaceMemberships: UserWorkspaceMembershipVerifierPort,
      ) => new GetAuthSessionUseCase(userAccessTokens, workspaceMemberships),
      inject: [USER_ACCESS_TOKEN_VERIFIER, USER_WORKSPACE_MEMBERSHIP_VERIFIER],
    },
    ApiKeyRequestAuthorizer,
  ],
  exports: [
    ApiKeyRequestAuthorizer,
    CreateApiKeyUseCase,
    IDENTITY_API_KEY_REPOSITORY,
    InMemoryApiKeyRepository,
    GetAuthSessionUseCase,
    ListApiKeysUseCase,
    RevokeApiKeyUseCase,
    Sha256ApiKeyHasher,
    VerifyApiKeyUseCase,
    IdentityUserAuthModule,
  ],
})
export class IdentityRestModule {}
