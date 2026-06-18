import { Module } from '@nestjs/common';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';
import { UsageRestModule } from '@social-monitor/usage/interfaces/rest/usage-rest.module';

import { JwksUserAccessTokenVerifier } from '../../adapters/authorization/jwks-user-access-token.verifier';
import { ClaimUserWorkspaceMembershipVerifier } from '../../adapters/authorization/claim-user-workspace-membership.verifier';
import { RejectingUserAccessTokenVerifier } from '../../adapters/authorization/rejecting-user-access-token.verifier';
import { Sha256ApiKeyHasher } from '../../adapters/hash/hmac-api-key.hasher';
import { InMemoryApiKeyRepository } from '../../adapters/persistence/in-memory-api-key.repository';
import { PrismaApiKeyRepository } from '../../adapters/persistence/prisma/prisma-api-key.repository';
import type { PrismaIdentityClient } from '../../adapters/persistence/prisma/prisma-identity-client';
import { PrismaIdentityConnection } from '../../adapters/persistence/prisma/prisma-identity-connection';
import { PrismaUserWorkspaceMembershipVerifier } from '../../adapters/persistence/prisma/prisma-user-workspace-membership.verifier';
import { CreateApiKeyUseCase } from '../../features/create-api-key/create-api-key.use-case';
import { ListApiKeysUseCase } from '../../features/list-api-keys/list-api-keys.use-case';
import { RevokeApiKeyUseCase } from '../../features/revoke-api-key/revoke-api-key.use-case';
import { VerifyApiKeyUseCase } from '../../features/verify-api-key/verify-api-key.use-case';
import {
  USER_ACCESS_TOKEN_VERIFIER,
  USER_WORKSPACE_MEMBERSHIP_VERIFIER,
  type ApiKeyRepositoryPort,
  type UserAccessTokenVerifierPort,
  type UserWorkspaceMembershipVerifierPort,
} from '../../ports';
import { IdentityAuthorizationModule } from '../authorization/identity-authorization.module';
import { ApiKeyRequestAuthorizer } from './api-key-request-authorizer';
import { ApiKeysController } from './api-keys.controller';
import {
  IDENTITY_API_KEY_REPOSITORY,
  IDENTITY_PUBLIC_API_RATE_LIMIT_PER_MINUTE,
  IDENTITY_PERSISTENCE_MODE,
  IDENTITY_PRISMA_CLIENT,
  IDENTITY_USER_ACCESS_TOKEN_CONFIG,
  resolveIdentityUserAccessTokenConfig,
  resolvePublicApiRateLimitPerMinute,
  resolveIdentityPersistenceMode,
  type IdentityUserAccessTokenConfig,
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
      provide: IDENTITY_PUBLIC_API_RATE_LIMIT_PER_MINUTE,
      useFactory: () => resolvePublicApiRateLimitPerMinute(process.env),
    },
    {
      provide: IDENTITY_USER_ACCESS_TOKEN_CONFIG,
      useFactory: () => resolveIdentityUserAccessTokenConfig(process.env),
    },
    {
      provide: USER_ACCESS_TOKEN_VERIFIER,
      useFactory: (config: IdentityUserAccessTokenConfig): UserAccessTokenVerifierPort =>
        config.mode === 'oidc-jwt'
          ? new JwksUserAccessTokenVerifier(config, new SystemClock())
          : new RejectingUserAccessTokenVerifier(),
      inject: [IDENTITY_USER_ACCESS_TOKEN_CONFIG],
    },
    {
      provide: IDENTITY_PRISMA_CLIENT,
      useFactory: (mode: IdentityPersistenceMode): PrismaIdentityClient | null =>
        mode === 'prisma' ? new PrismaIdentityConnection(process.env.DATABASE_URL ?? '') : null,
      inject: [IDENTITY_PERSISTENCE_MODE],
    },
    {
      provide: USER_WORKSPACE_MEMBERSHIP_VERIFIER,
      useFactory: (
        mode: IdentityPersistenceMode,
        prisma: PrismaIdentityClient | null,
      ): UserWorkspaceMembershipVerifierPort =>
        mode === 'prisma'
          ? new PrismaUserWorkspaceMembershipVerifier(requirePrismaIdentityClient(prisma))
          : new ClaimUserWorkspaceMembershipVerifier(),
      inject: [IDENTITY_PERSISTENCE_MODE, IDENTITY_PRISMA_CLIENT],
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
    ApiKeyRequestAuthorizer,
  ],
  exports: [
    ApiKeyRequestAuthorizer,
    CreateApiKeyUseCase,
    IDENTITY_API_KEY_REPOSITORY,
    USER_ACCESS_TOKEN_VERIFIER,
    USER_WORKSPACE_MEMBERSHIP_VERIFIER,
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
