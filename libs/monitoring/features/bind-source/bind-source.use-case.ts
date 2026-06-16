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
  TopicRepositoryPort,
} from '../../ports';
import type { BindSourceCommand } from './bind-source.command';
import type { BindSourceResult } from './bind-source.result';

type BindSourceFailure = DomainError | Error;

export class BindSourceUseCase {
  constructor(
    private readonly topics: TopicRepositoryPort,
    private readonly bindings: SourceBindingRepositoryPort,
    private readonly sourceCatalog: SourceCatalogPort,
    private readonly outbox: OutboxPort,
    private readonly idempotency: IdempotencyPort,
    private readonly configProtector: SourceBindingConfigProtectorPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
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

    const topic = await this.topics.findById({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      topicId: command.topicId,
    });
    if (!topic) {
      return err(new DomainError('resource.not_found', 'Topic not found', { topicId: command.topicId }));
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

    const existing = await this.bindings.findByTopicAndProvider({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      topicId: command.topicId,
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

    const protectedConfig = await this.configProtector.protect(command.config);
    const binding = SourceBinding.create({
      id: this.ids.generate(),
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      topicId: command.topicId,
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
        topicId: snapshot.topicId,
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
