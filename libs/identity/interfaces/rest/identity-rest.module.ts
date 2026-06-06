import { Module } from '@nestjs/common';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';

import { Sha256ApiKeyHasher } from '../../adapters/hash/hmac-api-key.hasher';
import { InMemoryApiKeyRepository } from '../../adapters/persistence/in-memory-api-key.repository';
import { CreateApiKeyUseCase } from '../../features/create-api-key/create-api-key.use-case';
import { RevokeApiKeyUseCase } from '../../features/revoke-api-key/revoke-api-key.use-case';
import { VerifyApiKeyUseCase } from '../../features/verify-api-key/verify-api-key.use-case';
import { ApiKeysController } from './api-keys.controller';

@Module({
  controllers: [ApiKeysController],
  providers: [
    InMemoryApiKeyRepository,
    Sha256ApiKeyHasher,
    {
      provide: CreateApiKeyUseCase,
      useFactory: (apiKeys: InMemoryApiKeyRepository, hasher: Sha256ApiKeyHasher) =>
        new CreateApiKeyUseCase(apiKeys, hasher, new CryptoIdGenerator(), new SystemClock()),
      inject: [InMemoryApiKeyRepository, Sha256ApiKeyHasher],
    },
    {
      provide: VerifyApiKeyUseCase,
      useFactory: (apiKeys: InMemoryApiKeyRepository, hasher: Sha256ApiKeyHasher) =>
        new VerifyApiKeyUseCase(apiKeys, hasher),
      inject: [InMemoryApiKeyRepository, Sha256ApiKeyHasher],
    },
    {
      provide: RevokeApiKeyUseCase,
      useFactory: (apiKeys: InMemoryApiKeyRepository) =>
        new RevokeApiKeyUseCase(apiKeys, new SystemClock()),
      inject: [InMemoryApiKeyRepository],
    },
  ],
  exports: [
    CreateApiKeyUseCase,
    InMemoryApiKeyRepository,
    RevokeApiKeyUseCase,
    Sha256ApiKeyHasher,
    VerifyApiKeyUseCase,
  ],
})
export class IdentityRestModule {}
