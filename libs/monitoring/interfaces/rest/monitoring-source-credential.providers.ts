import type { Provider } from '@nestjs/common';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';

import { OAuth2SourceCredentialRefresher } from '../../adapters/credentials/oauth2-source-credential-refresher';
import { InMemorySourceCredentialRepository } from '../../adapters/persistence/in-memory-source-credential.repository';
import type { PrismaMonitoringClient } from '../../adapters/persistence/prisma/prisma-monitoring-client';
import { PrismaSourceCredentialRepository } from '../../adapters/persistence/prisma/prisma-source-credential.repository';
import { InMemorySourceCredentialSecretVault } from '../../adapters/secrets/in-memory-source-credential.vault';
import {
  PrismaSourceCredentialVault,
  resolveSourceCredentialSecretEncryptionKey,
} from '../../adapters/secrets/prisma/prisma-source-credential.vault';
import { CreateSourceCredentialUseCase } from '../../features/create-source-credential/create-source-credential.use-case';
import { ListSourceCredentialsUseCase } from '../../features/list-source-credentials/list-source-credentials.use-case';
import { ResolveSourceCredentialUseCase } from '../../features/resolve-source-credential/resolve-source-credential.use-case';
import { RevokeSourceCredentialUseCase } from '../../features/revoke-source-credential/revoke-source-credential.use-case';
import { RotateSourceCredentialUseCase } from '../../features/rotate-source-credential/rotate-source-credential.use-case';
import type {
  SourceCredentialRefreshPort,
  SourceCredentialRepositoryPort,
  SourceCredentialResolverPort,
  SourceCredentialVaultPort,
} from '../../ports';
import { parseOptionalPositiveInteger } from './monitoring-capacity-limit-provider';
import {
  MONITORING_PERSISTENCE_MODE,
  MONITORING_PRISMA_CLIENT,
  MONITORING_SOURCE_CREDENTIAL_REFRESHER,
  MONITORING_SOURCE_CREDENTIAL_REPOSITORY,
  MONITORING_SOURCE_CREDENTIAL_RESOLVER,
  MONITORING_SOURCE_CREDENTIAL_VAULT,
  type MonitoringPersistenceMode,
} from './monitoring-provider-tokens';

export const monitoringSourceCredentialProviders = (
  env: NodeJS.ProcessEnv,
): Provider[] => [
  {
    provide: MONITORING_SOURCE_CREDENTIAL_REPOSITORY,
    useFactory: (
      mode: MonitoringPersistenceMode,
      prisma: PrismaMonitoringClient | null,
    ): SourceCredentialRepositoryPort =>
      mode === 'prisma'
        ? new PrismaSourceCredentialRepository(
            requirePrismaMonitoringClient(prisma),
          )
        : new InMemorySourceCredentialRepository(),
    inject: [MONITORING_PERSISTENCE_MODE, MONITORING_PRISMA_CLIENT],
  },
  {
    provide: MONITORING_SOURCE_CREDENTIAL_VAULT,
    useFactory: (
      mode: MonitoringPersistenceMode,
      prisma: PrismaMonitoringClient | null,
    ): SourceCredentialVaultPort =>
      mode === 'prisma'
        ? new PrismaSourceCredentialVault(
            requirePrismaMonitoringClient(prisma),
            resolveSourceCredentialSecretEncryptionKey(env),
          )
        : new InMemorySourceCredentialSecretVault(),
    inject: [MONITORING_PERSISTENCE_MODE, MONITORING_PRISMA_CLIENT],
  },
  {
    provide: MONITORING_SOURCE_CREDENTIAL_REFRESHER,
    useFactory: (): SourceCredentialRefreshPort =>
      new OAuth2SourceCredentialRefresher({
        timeoutMs: parseOptionalPositiveInteger(
          env.SOURCE_CREDENTIAL_REFRESH_TIMEOUT_MS,
        ),
        refreshSkewMs: parseOptionalPositiveInteger(
          env.SOURCE_CREDENTIAL_REFRESH_SKEW_MS,
        ),
      }),
  },
  {
    provide: MONITORING_SOURCE_CREDENTIAL_RESOLVER,
    useFactory: (
      credentials: SourceCredentialRepositoryPort,
      vault: SourceCredentialVaultPort,
      refresher: SourceCredentialRefreshPort,
    ): SourceCredentialResolverPort =>
      new ResolveSourceCredentialUseCase(
        credentials,
        vault,
        refresher,
        new SystemClock(),
      ),
    inject: [
      MONITORING_SOURCE_CREDENTIAL_REPOSITORY,
      MONITORING_SOURCE_CREDENTIAL_VAULT,
      MONITORING_SOURCE_CREDENTIAL_REFRESHER,
    ],
  },
  {
    provide: CreateSourceCredentialUseCase,
    useFactory: (
      credentials: SourceCredentialRepositoryPort,
      vault: SourceCredentialVaultPort,
    ) =>
      new CreateSourceCredentialUseCase(
        credentials,
        vault,
        new CryptoIdGenerator(),
        new SystemClock(),
      ),
    inject: [
      MONITORING_SOURCE_CREDENTIAL_REPOSITORY,
      MONITORING_SOURCE_CREDENTIAL_VAULT,
    ],
  },
  {
    provide: RotateSourceCredentialUseCase,
    useFactory: (
      credentials: SourceCredentialRepositoryPort,
      vault: SourceCredentialVaultPort,
    ) =>
      new RotateSourceCredentialUseCase(
        credentials,
        vault,
        new CryptoIdGenerator(),
        new SystemClock(),
      ),
    inject: [
      MONITORING_SOURCE_CREDENTIAL_REPOSITORY,
      MONITORING_SOURCE_CREDENTIAL_VAULT,
    ],
  },
  {
    provide: RevokeSourceCredentialUseCase,
    useFactory: (
      credentials: SourceCredentialRepositoryPort,
      vault: SourceCredentialVaultPort,
    ) =>
      new RevokeSourceCredentialUseCase(
        credentials,
        vault,
        new SystemClock(),
      ),
    inject: [
      MONITORING_SOURCE_CREDENTIAL_REPOSITORY,
      MONITORING_SOURCE_CREDENTIAL_VAULT,
    ],
  },
  {
    provide: ListSourceCredentialsUseCase,
    useFactory: (credentials: SourceCredentialRepositoryPort) =>
      new ListSourceCredentialsUseCase(credentials),
    inject: [MONITORING_SOURCE_CREDENTIAL_REPOSITORY],
  },
];

const requirePrismaMonitoringClient = (
  client: PrismaMonitoringClient | null,
): PrismaMonitoringClient => {
  if (client === null) {
    throw new Error('Prisma monitoring client is not configured');
  }

  return client;
};
