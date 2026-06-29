import {
  type Clock,
  DomainError,
  type IdGenerator,
  causationId,
  correlationId,
  eventId,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import { SourceBinding, type SourceBindingEnabledEvent } from '../../domain';
import type {
  IdempotencyPort,
  OutboxPort,
  SourceBindingConfigProtectorPort,
  SourceBindingRepositoryPort,
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
    private readonly bindings: SourceBindingRepositoryPort,
    private readonly sourceCatalog: SourceCatalogPort,
    private readonly outbox: OutboxPort,
    private readonly idempotency: IdempotencyPort,
    private readonly configProtector: SourceBindingConfigProtectorPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly capacityLimits: MonitoringCapacityLimits = {},
  ) {}

  async execute(command: BindSourceCommand): Promise<Result<BindSourceResult, BindSourceFailure>> {
    const cached = await this.idempotency.get<BindSourceResult>({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scope: 'monitoring.bind-source',
      key: command.idempotencyKey,
    });
    if (cached) {
      return ok({ ...cached.value, created: false });
    }

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
      return err(
        new DomainError('validation.failed', 'Source provider is not available for production-safe MVP scans', {
          providerKey: command.providerKey,
        }),
      );
    }

    const configValidation = await this.sourceCatalog.validateBindingConfig(command.providerKey, command.config);
    if (!configValidation.ok) {
      return err(
        new DomainError('validation.failed', 'Source binding config is invalid for provider', {
          providerKey: command.providerKey,
          reason: configValidation.reason,
        }),
      );
    }

    const existing = await this.bindings.findByInterestAndProvider({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      interestId: command.interestId,
      providerKey: command.providerKey,
    });
    if (existing) {
      const snapshot = existing.toSnapshot();
      const result = { sourceBindingId: snapshot.id, created: false };
      await this.idempotency.set({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        scope: 'monitoring.bind-source',
        key: command.idempotencyKey,
        value: result,
      });
      return ok(result);
    }

    const maxEnabledSourcesPerInterest = this.capacityLimits.maxEnabledSourcesPerInterest;
    if (maxEnabledSourcesPerInterest !== undefined) {
      const currentBindings = await this.bindings.listByInterest({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        interestId: command.interestId,
        limit: 100,
      });
      const enabledCount = currentBindings.sourceBindings.filter((binding) =>
        binding.toSnapshot().status === 'enabled').length;
      if (enabledCount >= maxEnabledSourcesPerInterest) {
        return err(new DomainError('operation.quota_exceeded', 'Interest source binding capacity limit reached', {
          limit: String(maxEnabledSourcesPerInterest),
        }));
      }
    }

    const protectedConfig = await this.configProtector.protect(command.config);
    const binding = SourceBinding.create({
      id: this.ids.generate(),
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      interestId: command.interestId,
      providerKey: capability.providerKey,
      capabilityProfileVersion: capability.version,
      config: protectedConfig,
      createdAt: this.clock.now(),
    });
    const snapshot = binding.toSnapshot();

    await this.bindings.save(binding);

    const event: SourceBindingEnabledEvent = {
      eventId: eventId(this.ids.generate()),
      eventType: 'monitoring.source-binding.enabled',
      schemaVersion: 1,
      occurredAt: this.clock.now(),
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
    await this.outbox.append(event);

    const result = { sourceBindingId: snapshot.id, created: true };
    await this.idempotency.set({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scope: 'monitoring.bind-source',
      key: command.idempotencyKey,
      value: result,
    });

    return ok(result);
  }
}
