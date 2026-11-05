import {
  type Clock,
  DomainError,
  type IdGenerator,
  causationId,
  correlationId,
  eventId,
  err,
  type Result,
} from '@social-monitor/shared-kernel';

import { SourceBinding, type SourceBindingEnabledEvent } from '../../domain';
import {
  BIND_SOURCE_CREATION_SCOPE,
  type SourceBindingCreationCommitPort,
} from '../../application/contracts/source-binding-creation-commit';
import { replaySourceBindingReceipt } from '../../application/source-binding-creation-decision';
import type {
  IdempotencyPort,
  SourceBindingConfigProtectorPort,
  SourceCatalogPort,
  InterestRepositoryPort,
} from '../../ports';
import type { MonitoringCapacityLimits } from '../shared/monitoring-capacity-limits';
import type { BindSourceCommand } from './bind-source.command';
import type { BindSourceResult } from './bind-source.result';

type BindSourceFailure = DomainError | Error;

export class BindSourceUseCase {
  constructor(
    private readonly interests: InterestRepositoryPort,
    private readonly creation: SourceBindingCreationCommitPort,
    private readonly sourceCatalog: SourceCatalogPort,
    private readonly idempotency: Pick<IdempotencyPort, 'get'>,
    private readonly configProtector: SourceBindingConfigProtectorPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly capacityLimits: MonitoringCapacityLimits = {},
  ) {}

  async execute(command: BindSourceCommand): Promise<Result<BindSourceResult, BindSourceFailure>> {
    const cached = await this.idempotency.get<BindSourceResult>({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scope: BIND_SOURCE_CREATION_SCOPE,
      key: command.idempotencyKey,
    });
    if (cached) return replaySourceBindingReceipt(cached.value);

    // Fast user-facing validation; the durable commit rechecks existence,
    // canonical identity and full enabled capacity inside one transaction.
    const interest = await this.interests.findById({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      interestId: command.interestId,
    });
    if (!interest) {
      return err(new DomainError('resource.not_found', 'Interest not found', { interestId: command.interestId }));
    }

    const capability = await this.sourceCatalog.getCapability(command.providerKey);
    if (!capability || !capability.productionSafe) {
      return err(new DomainError('validation.failed',
        'Source provider is not available for production-safe MVP scans', {
          providerKey: command.providerKey,
        }));
    }

    const configValidation = await this.sourceCatalog.validateBindingConfig(command.providerKey, command.config);
    if (!configValidation.ok) {
      return err(new DomainError('validation.failed', 'Source binding config is invalid for provider', {
        providerKey: command.providerKey,
        reason: configValidation.reason,
      }));
    }

    const now = this.clock.now();
    const protectedConfig = await this.configProtector.protect(configValidation.normalizedConfig ?? command.config);
    const binding = SourceBinding.create({
      id: this.ids.generate(),
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      interestId: command.interestId,
      // Never use a caller alias as the persisted/duplicate provider identity.
      providerKey: capability.providerKey,
      capabilityProfileVersion: capability.version,
      config: protectedConfig,
      createdAt: now,
    });
    const snapshot = binding.toSnapshot();
    const event: SourceBindingEnabledEvent = {
      eventId: eventId(this.ids.generate()),
      eventType: 'monitoring.source-binding.enabled',
      schemaVersion: 1,
      occurredAt: now,
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      correlationId: correlationId(command.correlationId),
      causationId: causationId(command.idempotencyKey),
      payload: {
        sourceBindingId: snapshot.id,
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        interestId: snapshot.interestId,
        providerKey: snapshot.providerKey,
        capabilityProfileVersion: snapshot.capabilityProfileVersion,
      },
    };
    return this.creation.commit({
      binding, event, idempotencyKey: command.idempotencyKey,
      receiptId: this.ids.generate(),
      ...(configValidation.configIdentity === undefined ? {} : {
        configIdentity: configValidation.configIdentity,
      }),
      maxEnabledSourcesPerInterest: this.capacityLimits.maxEnabledSourcesPerInterest,
    });
  }
}
