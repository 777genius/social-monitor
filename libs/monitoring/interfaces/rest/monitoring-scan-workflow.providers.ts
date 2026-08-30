import type { Provider } from '@nestjs/common';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';
import { ReserveUsageQuotaUseCase } from '@social-monitor/usage/features/reserve-usage-quota/reserve-usage-quota.use-case';

import { UsageScanRequestQuotaAdapter } from '../../adapters/quota/usage-scan-request-quota.adapter';
import { GetScanPolicyUseCase } from '../../features/get-scan-policy/get-scan-policy.use-case';
import { GetScanStatusUseCase } from '../../features/get-scan-status/get-scan-status.use-case';
import { ListSourceBindingDailyHistoryUseCase } from '../../features/list-source-binding-daily-history/list-source-binding-daily-history.use-case';
import { ListSourceBindingScansUseCase } from '../../features/list-source-binding-scans/list-source-binding-scans.use-case';
import { RecordScanExecutionUseCase } from '../../features/record-scan-execution/record-scan-execution.use-case';
import { RequestScanUseCase } from '../../features/request-scan/request-scan.use-case';
import { SetScanPolicyUseCase } from '../../features/set-scan-policy/set-scan-policy.use-case';
import type {
  IdempotencyPort,
  OutboxPort,
  ScanDispatchPort,
  ScanExecutionAttemptReadPort,
  ScanJobHistoryReadPort,
  ScanJobRepositoryPort,
  ScanPolicyRepositoryPort,
  ScanQueuePort,
  ScanSchedulerDecisionHistoryPort,
  SourceBindingRepositoryPort,
} from '../../ports';
import {
  MONITORING_IDEMPOTENCY,
  MONITORING_OUTBOX,
  MONITORING_SCAN_DISPATCH,
  MONITORING_SCAN_EXECUTION_ATTEMPT_READ_MODEL,
  MONITORING_SCAN_JOB_REPOSITORY,
  MONITORING_SCAN_POLICY_REPOSITORY,
  MONITORING_SCAN_QUEUE,
  MONITORING_SCAN_SCHEDULER_DECISION_HISTORY,
  MONITORING_SOURCE_BINDING_REPOSITORY,
  resolveManualScanRequestQuotaPerHour,
} from './monitoring-provider-tokens';

type MonitoringScanJobStorePort =
  ScanJobRepositoryPort & ScanJobHistoryReadPort;

export const monitoringScanWorkflowProviders = (
  env: NodeJS.ProcessEnv,
): Provider[] => [
  {
    provide: UsageScanRequestQuotaAdapter,
    useFactory: (reserveUsageQuota: ReserveUsageQuotaUseCase) =>
      new UsageScanRequestQuotaAdapter(reserveUsageQuota, {
        quotaPerHour: resolveManualScanRequestQuotaPerHour(env),
      }),
    inject: [ReserveUsageQuotaUseCase],
  },
  {
    provide: SetScanPolicyUseCase,
    useFactory: (
      bindings: SourceBindingRepositoryPort,
      scanPolicies: ScanPolicyRepositoryPort,
      outbox: OutboxPort,
      idempotency: IdempotencyPort,
    ) =>
      new SetScanPolicyUseCase(
        bindings,
        scanPolicies,
        outbox,
        idempotency,
        new CryptoIdGenerator(),
        new SystemClock(),
      ),
    inject: [
      MONITORING_SOURCE_BINDING_REPOSITORY,
      MONITORING_SCAN_POLICY_REPOSITORY,
      MONITORING_OUTBOX,
      MONITORING_IDEMPOTENCY,
    ],
  },
  {
    provide: GetScanPolicyUseCase,
    useFactory: (
      bindings: SourceBindingRepositoryPort,
      scanPolicies: ScanPolicyRepositoryPort,
    ) => new GetScanPolicyUseCase(bindings, scanPolicies),
    inject: [
      MONITORING_SOURCE_BINDING_REPOSITORY,
      MONITORING_SCAN_POLICY_REPOSITORY,
    ],
  },
  {
    provide: RequestScanUseCase,
    useFactory: (
      bindings: SourceBindingRepositoryPort,
      scanPolicies: ScanPolicyRepositoryPort,
      scanJobs: MonitoringScanJobStorePort,
      scanQueue: ScanQueuePort,
      outbox: OutboxPort,
      idempotency: IdempotencyPort,
      scanRequestQuota: UsageScanRequestQuotaAdapter,
      scanDispatch: ScanDispatchPort,
    ) =>
      new RequestScanUseCase(
        bindings,
        scanPolicies,
        scanJobs,
        scanQueue,
        outbox,
        idempotency,
        scanRequestQuota,
        new CryptoIdGenerator(),
        new SystemClock(),
        scanDispatch,
      ),
    inject: [
      MONITORING_SOURCE_BINDING_REPOSITORY,
      MONITORING_SCAN_POLICY_REPOSITORY,
      MONITORING_SCAN_JOB_REPOSITORY,
      MONITORING_SCAN_QUEUE,
      MONITORING_OUTBOX,
      MONITORING_IDEMPOTENCY,
      UsageScanRequestQuotaAdapter,
      MONITORING_SCAN_DISPATCH,
    ],
  },
  {
    provide: GetScanStatusUseCase,
    useFactory: (
      scanJobs: ScanJobRepositoryPort,
      scanExecutionAttempts: ScanExecutionAttemptReadPort,
    ) => new GetScanStatusUseCase(scanJobs, scanExecutionAttempts),
    inject: [
      MONITORING_SCAN_JOB_REPOSITORY,
      MONITORING_SCAN_EXECUTION_ATTEMPT_READ_MODEL,
    ],
  },
  {
    provide: ListSourceBindingScansUseCase,
    useFactory: (
      sourceBindings: SourceBindingRepositoryPort,
      scanJobs: MonitoringScanJobStorePort,
      scanExecutionAttempts: ScanExecutionAttemptReadPort,
    ) =>
      new ListSourceBindingScansUseCase(
        sourceBindings,
        scanJobs,
        scanExecutionAttempts,
      ),
    inject: [
      MONITORING_SOURCE_BINDING_REPOSITORY,
      MONITORING_SCAN_JOB_REPOSITORY,
      MONITORING_SCAN_EXECUTION_ATTEMPT_READ_MODEL,
    ],
  },
  {
    provide: ListSourceBindingDailyHistoryUseCase,
    useFactory: (
      sourceBindings: SourceBindingRepositoryPort,
      scanPolicies: ScanPolicyRepositoryPort,
      scanJobs: MonitoringScanJobStorePort,
      scanExecutionAttempts: ScanExecutionAttemptReadPort,
      schedulerDecisions: ScanSchedulerDecisionHistoryPort,
    ) =>
      new ListSourceBindingDailyHistoryUseCase(
        sourceBindings,
        scanPolicies,
        scanJobs,
        scanExecutionAttempts,
        new SystemClock(),
        schedulerDecisions,
      ),
    inject: [
      MONITORING_SOURCE_BINDING_REPOSITORY,
      MONITORING_SCAN_POLICY_REPOSITORY,
      MONITORING_SCAN_JOB_REPOSITORY,
      MONITORING_SCAN_EXECUTION_ATTEMPT_READ_MODEL,
      MONITORING_SCAN_SCHEDULER_DECISION_HISTORY,
    ],
  },
  {
    provide: RecordScanExecutionUseCase,
    useFactory: (scanJobs: ScanJobRepositoryPort) =>
      new RecordScanExecutionUseCase(scanJobs),
    inject: [MONITORING_SCAN_JOB_REPOSITORY],
  },
];
