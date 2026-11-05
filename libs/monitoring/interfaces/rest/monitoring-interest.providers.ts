import type { Provider } from '@nestjs/common';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';

import { ArchiveInterestUseCase } from '../../features/archive-interest/archive-interest.use-case';
import { CreateInterestUseCase } from '../../features/create-interest/create-interest.use-case';
import { ListInterestsUseCase } from '../../features/list-interests/list-interests.use-case';
import { PlanInterestCoverageUseCase } from '../../features/plan-interest-coverage/plan-interest-coverage.use-case';
import { UpdateInterestUseCase } from '../../features/update-interest/update-interest.use-case';
import type {
  IdempotencyPort,
  InterestRepositoryPort,
  SourceBindingRepositoryPort,
  SourceCatalogPort,
} from '../../ports';
import type { InterestCreationCommitPort } from '../../application/contracts/interest-creation-commit';
import { resolveMonitoringCapacityLimits } from './monitoring-capacity-limit-provider';
import {
  MONITORING_IDEMPOTENCY,
  MONITORING_INTEREST_REPOSITORY,
  MONITORING_INTEREST_CREATION_COMMIT,
  MONITORING_SOURCE_BINDING_REPOSITORY,
  MONITORING_SOURCE_CATALOG,
} from './monitoring-provider-tokens';

export const monitoringInterestProviders = (
  env: NodeJS.ProcessEnv,
): Provider[] => [
  {
    provide: CreateInterestUseCase,
    useFactory: (
      creation: InterestCreationCommitPort,
      idempotency: IdempotencyPort,
    ) =>
      new CreateInterestUseCase(
        creation,
        idempotency,
        new CryptoIdGenerator(),
        new SystemClock(),
        resolveMonitoringCapacityLimits(env),
      ),
    inject: [
      MONITORING_INTEREST_CREATION_COMMIT,
      MONITORING_IDEMPOTENCY,
    ],
  },
  {
    provide: ListInterestsUseCase,
    useFactory: (interests: InterestRepositoryPort) =>
      new ListInterestsUseCase(interests),
    inject: [MONITORING_INTEREST_REPOSITORY],
  },
  {
    provide: PlanInterestCoverageUseCase,
    useFactory: (
      interests: InterestRepositoryPort,
      sourceBindings: SourceBindingRepositoryPort,
      sourceCatalog: SourceCatalogPort,
    ) =>
      new PlanInterestCoverageUseCase(
        interests,
        sourceBindings,
        sourceCatalog,
      ),
    inject: [
      MONITORING_INTEREST_REPOSITORY,
      MONITORING_SOURCE_BINDING_REPOSITORY,
      MONITORING_SOURCE_CATALOG,
    ],
  },
  {
    provide: UpdateInterestUseCase,
    useFactory: (interests: InterestRepositoryPort) =>
      new UpdateInterestUseCase(interests),
    inject: [MONITORING_INTEREST_REPOSITORY],
  },
  {
    provide: ArchiveInterestUseCase,
    useFactory: (interests: InterestRepositoryPort) =>
      new ArchiveInterestUseCase(interests, new SystemClock()),
    inject: [MONITORING_INTEREST_REPOSITORY],
  },
];
