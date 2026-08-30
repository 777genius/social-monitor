import { Module } from '@nestjs/common';
import { IdentityRestModule } from '@social-monitor/identity/interfaces/rest/identity-rest.module';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';
import { RequestCorrelationIdFactory } from '@social-monitor/platform-request-context';
import { UsageRestModule } from '@social-monitor/usage/interfaces/rest/usage-rest.module';

import { ApplyAcceptedTopicRecommendationUseCase } from '../../features/apply-accepted-topic-recommendation/apply-accepted-topic-recommendation.use-case';
import { BindSourceUseCase } from '../../features/bind-source/bind-source.use-case';
import { CreateInterestUseCase } from '../../features/create-interest/create-interest.use-case';
import { GetScanStatusUseCase } from '../../features/get-scan-status/get-scan-status.use-case';
import { ListSourceBindingDailyHistoryUseCase } from '../../features/list-source-binding-daily-history/list-source-binding-daily-history.use-case';
import { ListSourceBindingScansUseCase } from '../../features/list-source-binding-scans/list-source-binding-scans.use-case';
import { PlanInterestCoverageUseCase } from '../../features/plan-interest-coverage/plan-interest-coverage.use-case';
import { RecordScanExecutionUseCase } from '../../features/record-scan-execution/record-scan-execution.use-case';
import { ScheduleDueScansUseCase } from '../../features/schedule-due-scans/schedule-due-scans.use-case';
import { SetScanPolicyUseCase } from '../../features/set-scan-policy/set-scan-policy.use-case';
import { InterestCoveragePlanController } from './interest-coverage-plan.controller';
import { InterestController } from './interest.controller';
import { monitoringInterestProviders } from './monitoring-interest.providers';
import { monitoringPersistenceProviders } from './monitoring-persistence.providers';
import { MonitoringPrismaClientModule } from './monitoring-prisma-client.module';
import {
  MONITORING_CONFIG_PROTECTOR,
  MONITORING_SOURCE_BINDING_REPOSITORY,
  MONITORING_SOURCE_CREDENTIAL_RESOLVER,
  monitoringScanQueueModeProvider,
} from './monitoring-provider-tokens';
import { monitoringScanDispatchProviders } from './monitoring-scan-dispatch.providers';
import { monitoringScanQueueProviders } from './monitoring-scan-queue.providers';
import { monitoringScanWorkflowProviders } from './monitoring-scan-workflow.providers';
import { monitoringSchedulerProviders } from './monitoring-scheduler.providers';
import { monitoringSourceBindingProviders } from './monitoring-source-binding.providers';
import { monitoringSourceCredentialProviders } from './monitoring-source-credential.providers';
import { ScanPolicyController } from './scan-policy.controller';
import { ScanRequestController } from './scan-request.controller';
import { ScanStatusController } from './scan-status.controller';
import { SourceBindingController } from './source-binding.controller';
import { SourceCredentialController } from './source-credential.controller';

@Module({
  imports: [
    UsageRestModule,
    IdentityRestModule,
    MonitoringPrismaClientModule,
  ],
  controllers: [
    InterestController,
    SourceBindingController,
    ScanPolicyController,
    ScanRequestController,
    ScanStatusController,
    SourceCredentialController,
    InterestCoveragePlanController,
  ],
  providers: [
    monitoringScanQueueModeProvider,
    ...monitoringPersistenceProviders,
    ...monitoringSourceCredentialProviders(process.env),
    ...monitoringScanQueueProviders(process.env),
    RequestCorrelationIdFactory,
    ...monitoringSourceBindingProviders(process.env),
    ...monitoringScanDispatchProviders,
    ...monitoringInterestProviders(process.env),
    ...monitoringScanWorkflowProviders(process.env),
    ...monitoringSchedulerProviders,
  ],
  exports: [
    ApplyAcceptedTopicRecommendationUseCase,
    BindSourceUseCase,
    CreateInterestUseCase,
    PlanInterestCoverageUseCase,
    ScheduleDueScansUseCase,
    SetScanPolicyUseCase,
    GetScanStatusUseCase,
    ListSourceBindingDailyHistoryUseCase,
    ListSourceBindingScansUseCase,
    RecordScanExecutionUseCase,
    InMemoryQueuePublisher,
    MONITORING_CONFIG_PROTECTOR,
    MONITORING_SOURCE_BINDING_REPOSITORY,
    MONITORING_SOURCE_CREDENTIAL_RESOLVER,
  ],
})
export class MonitoringRestModule {}
