import type { Provider } from '@nestjs/common';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';

import { InMemoryScanSchedulerDecisionHistoryRepository } from '../../adapters/persistence/in-memory-scan-scheduler-decision-history.repository';
import type { PrismaMonitoringClient } from '../../adapters/persistence/prisma/prisma-monitoring-client';
import { PrismaScanSchedulerDecisionHistoryRepository } from '../../adapters/persistence/prisma/prisma-scan-scheduler-decision-history.repository';
import { ListInterestSourceDailyHistoryUseCase } from '../../features/list-interest-source-daily-history/list-interest-source-daily-history.use-case';
import { ScheduleDueScansUseCase } from '../../features/schedule-due-scans/schedule-due-scans.use-case';
import type {
  ScanExecutionAttemptReadPort,
  ScanJobHistoryReadPort,
  ScanJobRepositoryPort,
  ScanPolicyRepositoryPort,
  ScanQueuePort,
  ScanSchedulerDecisionHistoryPort,
  SourceBindingRepositoryPort,
  InterestRepositoryPort,
} from '../../ports';
import {
  MONITORING_PERSISTENCE_MODE,
  MONITORING_PRISMA_CLIENT,
  MONITORING_SCAN_EXECUTION_ATTEMPT_READ_MODEL,
  MONITORING_SCAN_JOB_REPOSITORY,
  MONITORING_SCAN_POLICY_REPOSITORY,
  MONITORING_SCAN_QUEUE,
  MONITORING_SCAN_SCHEDULER_DECISION_HISTORY,
  MONITORING_SOURCE_BINDING_REPOSITORY,
  MONITORING_INTEREST_REPOSITORY,
  type MonitoringPersistenceMode,
} from './monitoring-provider-tokens';

type MonitoringScanJobStorePort = ScanJobRepositoryPort & ScanJobHistoryReadPort;

export const monitoringSchedulerProviders: Provider[] = [
  {
    provide: MONITORING_SCAN_SCHEDULER_DECISION_HISTORY,
    useFactory: (
      mode: MonitoringPersistenceMode,
      prisma: PrismaMonitoringClient | null,
    ): ScanSchedulerDecisionHistoryPort =>
      mode === 'prisma'
        ? new PrismaScanSchedulerDecisionHistoryRepository(
            requirePrismaMonitoringClient(prisma),
          )
        : new InMemoryScanSchedulerDecisionHistoryRepository(),
    inject: [MONITORING_PERSISTENCE_MODE, MONITORING_PRISMA_CLIENT],
  },
  {
    provide: ListInterestSourceDailyHistoryUseCase,
    useFactory: (
      interests: InterestRepositoryPort,
      bindings: SourceBindingRepositoryPort,
      scanPolicies: ScanPolicyRepositoryPort,
      scanJobs: MonitoringScanJobStorePort,
      scanExecutionAttempts: ScanExecutionAttemptReadPort,
      schedulerDecisions: ScanSchedulerDecisionHistoryPort,
    ) =>
      new ListInterestSourceDailyHistoryUseCase(
        interests,
        bindings,
        scanPolicies,
        scanJobs,
        scanExecutionAttempts,
        new SystemClock(),
        schedulerDecisions,
      ),
    inject: [
      MONITORING_INTEREST_REPOSITORY,
      MONITORING_SOURCE_BINDING_REPOSITORY,
      MONITORING_SCAN_POLICY_REPOSITORY,
      MONITORING_SCAN_JOB_REPOSITORY,
      MONITORING_SCAN_EXECUTION_ATTEMPT_READ_MODEL,
      MONITORING_SCAN_SCHEDULER_DECISION_HISTORY,
    ],
  },
  {
    provide: ScheduleDueScansUseCase,
    useFactory: (
      bindings: SourceBindingRepositoryPort,
      scanPolicies: ScanPolicyRepositoryPort,
      scanJobs: MonitoringScanJobStorePort,
      scanQueue: ScanQueuePort,
      schedulerDecisions: ScanSchedulerDecisionHistoryPort,
    ) =>
      new ScheduleDueScansUseCase(
        bindings,
        scanPolicies,
        scanJobs,
        scanQueue,
        new CryptoIdGenerator(),
        new SystemClock(),
        schedulerDecisions,
      ),
    inject: [
      MONITORING_SOURCE_BINDING_REPOSITORY,
      MONITORING_SCAN_POLICY_REPOSITORY,
      MONITORING_SCAN_JOB_REPOSITORY,
      MONITORING_SCAN_QUEUE,
      MONITORING_SCAN_SCHEDULER_DECISION_HISTORY,
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
