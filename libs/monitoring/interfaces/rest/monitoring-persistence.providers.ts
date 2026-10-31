import type { Provider } from '@nestjs/common';
import { CryptoIdGenerator } from '@social-monitor/shared-kernel';

import { InMemoryIdempotencyAdapter } from '../../adapters/idempotency/in-memory-idempotency.adapter';
import { PrismaIdempotencyAdapter } from '../../adapters/idempotency/prisma/prisma-idempotency.adapter';
import { InMemoryInterestRepository } from '../../adapters/persistence/in-memory-interest.repository';
import { InMemoryInterestCreationState } from '../../adapters/persistence/in-memory-interest-creation-state';
import { InMemoryInterestCreationStore } from '../../adapters/persistence/in-memory-interest-creation.store';
import { PrismaInterestCreationStore } from '../../adapters/persistence/prisma/prisma-interest-creation.store';
import type { InterestCreationCommitPort } from '../../application/contracts/interest-creation-commit';
import { InMemoryScanExecutionAttemptReadModel } from '../../adapters/persistence/in-memory-scan-execution-attempt-read-model';
import { InMemoryScanJobRepository } from '../../adapters/persistence/in-memory-scan-job.repository';
import { InMemoryScanPolicyRepository } from '../../adapters/persistence/in-memory-scan-policy.repository';
import { InMemorySourceBindingCreationStore } from '../../adapters/persistence/in-memory-source-binding-creation.store';
import { PrismaSourceBindingCreationStore } from '../../adapters/persistence/prisma/prisma-source-binding-creation.store';
import type { SourceBindingCreationCommitPort } from '../../application/contracts/source-binding-creation-commit';
import { InMemorySourceBindingRepository } from '../../adapters/persistence/in-memory-source-binding.repository';
import { PrismaInterestRepository } from '../../adapters/persistence/prisma/prisma-interest.repository';
import type { PrismaMonitoringClient } from '../../adapters/persistence/prisma/prisma-monitoring-client';
import { PrismaScanExecutionAttemptReadModel } from '../../adapters/persistence/prisma/prisma-scan-execution-attempt-read-model';
import { PrismaScanJobRepository } from '../../adapters/persistence/prisma/prisma-scan-job.repository';
import { PrismaScanPolicyRepository } from '../../adapters/persistence/prisma/prisma-scan-policy.repository';
import { PrismaSourceBindingRepository } from '../../adapters/persistence/prisma/prisma-source-binding.repository';
import type {
  IdempotencyPort,
  InterestRepositoryPort,
  ScanExecutionAttemptReadPort,
  ScanJobHistoryReadPort,
  ScanJobRepositoryPort,
  ScanJobOutcomeRepositoryPort,
  ScanPolicyRepositoryPort,
  SourceBindingRepositoryPort,
} from '../../ports';
import {
  MONITORING_IDEMPOTENCY,
  MONITORING_INTEREST_REPOSITORY,
  MONITORING_INTEREST_CREATION_COMMIT,
  MONITORING_PERSISTENCE_MODE,
  MONITORING_PRISMA_CLIENT,
  MONITORING_SCAN_EXECUTION_ATTEMPT_READ_MODEL,
  MONITORING_SCAN_JOB_REPOSITORY,
  MONITORING_SCAN_POLICY_REPOSITORY,
  MONITORING_SOURCE_BINDING_REPOSITORY,
  MONITORING_SOURCE_BINDING_CREATION_COMMIT,
  type MonitoringPersistenceMode,
} from './monitoring-provider-tokens';

type MonitoringScanJobStorePort =
  ScanJobRepositoryPort & ScanJobHistoryReadPort & ScanJobOutcomeRepositoryPort;

export const monitoringPersistenceProviders: Provider[] = [
  InMemoryInterestCreationState,
  {
    provide: MONITORING_INTEREST_CREATION_COMMIT,
    useFactory: (mode: MonitoringPersistenceMode, prisma: PrismaMonitoringClient | null,
      state: InMemoryInterestCreationState): InterestCreationCommitPort => mode === 'prisma'
      ? new PrismaInterestCreationStore(requirePrismaMonitoringClient(prisma))
      : new InMemoryInterestCreationStore(state),
    inject: [MONITORING_PERSISTENCE_MODE, MONITORING_PRISMA_CLIENT, InMemoryInterestCreationState],
  },
  {
    provide: MONITORING_INTEREST_REPOSITORY,
    useFactory: (
      mode: MonitoringPersistenceMode,
      prisma: PrismaMonitoringClient | null,
      state: InMemoryInterestCreationState,
    ): InterestRepositoryPort =>
      mode === 'prisma'
        ? new PrismaInterestRepository(requirePrismaMonitoringClient(prisma))
        : new InMemoryInterestRepository(state),
    inject: [MONITORING_PERSISTENCE_MODE, MONITORING_PRISMA_CLIENT, InMemoryInterestCreationState],
  },
  {
    provide: MONITORING_SOURCE_BINDING_CREATION_COMMIT,
    useFactory: (
      mode: MonitoringPersistenceMode,
      prisma: PrismaMonitoringClient | null,
      state: InMemoryInterestCreationState,
    ): SourceBindingCreationCommitPort => mode === 'prisma'
      ? new PrismaSourceBindingCreationStore(requirePrismaMonitoringClient(prisma))
      : new InMemorySourceBindingCreationStore(state),
    inject: [MONITORING_PERSISTENCE_MODE, MONITORING_PRISMA_CLIENT, InMemoryInterestCreationState],
  },
  {
    provide: MONITORING_SOURCE_BINDING_REPOSITORY,
    useFactory: (
      mode: MonitoringPersistenceMode,
      prisma: PrismaMonitoringClient | null,
      state: InMemoryInterestCreationState,
    ): SourceBindingRepositoryPort =>
      mode === 'prisma'
        ? new PrismaSourceBindingRepository(requirePrismaMonitoringClient(prisma))
        : new InMemorySourceBindingRepository(state),
    inject: [MONITORING_PERSISTENCE_MODE, MONITORING_PRISMA_CLIENT, InMemoryInterestCreationState],
  },
  {
    provide: MONITORING_SCAN_POLICY_REPOSITORY,
    useFactory: (
      mode: MonitoringPersistenceMode,
      prisma: PrismaMonitoringClient | null,
    ): ScanPolicyRepositoryPort =>
      mode === 'prisma'
        ? new PrismaScanPolicyRepository(requirePrismaMonitoringClient(prisma))
        : new InMemoryScanPolicyRepository(),
    inject: [MONITORING_PERSISTENCE_MODE, MONITORING_PRISMA_CLIENT],
  },
  {
    provide: MONITORING_SCAN_JOB_REPOSITORY,
    useFactory: (
      mode: MonitoringPersistenceMode,
      prisma: PrismaMonitoringClient | null,
    ): MonitoringScanJobStorePort =>
      mode === 'prisma'
        ? new PrismaScanJobRepository(requirePrismaMonitoringClient(prisma))
        : new InMemoryScanJobRepository(),
    inject: [MONITORING_PERSISTENCE_MODE, MONITORING_PRISMA_CLIENT],
  },
  {
    provide: MONITORING_SCAN_EXECUTION_ATTEMPT_READ_MODEL,
    useFactory: (
      mode: MonitoringPersistenceMode,
      prisma: PrismaMonitoringClient | null,
    ): ScanExecutionAttemptReadPort =>
      mode === 'prisma'
        ? new PrismaScanExecutionAttemptReadModel(
            requirePrismaMonitoringClient(prisma),
          )
        : new InMemoryScanExecutionAttemptReadModel(),
    inject: [MONITORING_PERSISTENCE_MODE, MONITORING_PRISMA_CLIENT],
  },
  {
    provide: MONITORING_IDEMPOTENCY,
    useFactory: (
      mode: MonitoringPersistenceMode,
      prisma: PrismaMonitoringClient | null,
      state: InMemoryInterestCreationState,
    ): IdempotencyPort =>
      mode === 'prisma'
        ? new PrismaIdempotencyAdapter(
            requirePrismaMonitoringClient(prisma),
            new CryptoIdGenerator(),
          )
        : new InMemoryIdempotencyAdapter(state),
    inject: [MONITORING_PERSISTENCE_MODE, MONITORING_PRISMA_CLIENT, InMemoryInterestCreationState],
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
