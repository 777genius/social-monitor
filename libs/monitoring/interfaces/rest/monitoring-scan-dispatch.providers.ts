import type { Provider } from '@nestjs/common';

import { InMemoryOutboxAdapter } from '../../adapters/messaging/in-memory-outbox.adapter';
import { InMemoryInterestCreationState } from '../../adapters/persistence/in-memory-interest-creation-state';
import { DirectScanDispatchAdapter } from '../../adapters/queue/direct-scan-dispatch.adapter';
import type { PrismaMonitoringClient } from '../../adapters/persistence/prisma/prisma-monitoring-client';
import { PrismaMonitoringOutboxAdapter } from '../../adapters/persistence/prisma/prisma-monitoring-outbox.adapter';
import { PrismaScanDispatchAdapter } from '../../adapters/persistence/prisma/prisma-scan-dispatch.adapter';
import type {
  OutboxPort,
  ScanDispatchPort,
  ScanJobHistoryReadPort,
  ScanJobRepositoryPort,
  ScanQueuePort,
} from '../../ports';
import {
  MONITORING_OUTBOX,
  MONITORING_PERSISTENCE_MODE,
  MONITORING_PRISMA_CLIENT,
  MONITORING_SCAN_DISPATCH,
  MONITORING_SCAN_JOB_REPOSITORY,
  MONITORING_SCAN_QUEUE,
  type MonitoringPersistenceMode,
} from './monitoring-provider-tokens';

type MonitoringScanJobStorePort =
  ScanJobRepositoryPort & ScanJobHistoryReadPort;

export const monitoringScanDispatchProviders: Provider[] = [
  {
    provide: MONITORING_OUTBOX,
    useFactory: (
      mode: MonitoringPersistenceMode,
      prisma: PrismaMonitoringClient | null,
      state: InMemoryInterestCreationState,
    ): OutboxPort =>
      mode === 'prisma'
        ? new PrismaMonitoringOutboxAdapter(
            requirePrismaMonitoringClient(prisma),
          )
        : new InMemoryOutboxAdapter(state),
    inject: [MONITORING_PERSISTENCE_MODE, MONITORING_PRISMA_CLIENT, InMemoryInterestCreationState],
  },
  {
    provide: MONITORING_SCAN_DISPATCH,
    useFactory: (
      mode: MonitoringPersistenceMode,
      prisma: PrismaMonitoringClient | null,
      scanJobs: MonitoringScanJobStorePort,
      scanQueue: ScanQueuePort,
      outbox: OutboxPort,
    ): ScanDispatchPort =>
      mode === 'prisma'
        ? new PrismaScanDispatchAdapter(
            requirePrismaMonitoringClient(prisma),
          )
        : new DirectScanDispatchAdapter(scanJobs, scanQueue, outbox),
    inject: [
      MONITORING_PERSISTENCE_MODE,
      MONITORING_PRISMA_CLIENT,
      MONITORING_SCAN_JOB_REPOSITORY,
      MONITORING_SCAN_QUEUE,
      MONITORING_OUTBOX,
    ],
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
