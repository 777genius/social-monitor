import { DomainError, type Clock, type IdGenerator, causationId, correlationId, eventId, err, ok, type Result } from '@social-monitor/shared-kernel';
import type { SourceBinding, SourceBindingConfigExpandedEvent } from '../../domain';
import type { SourceBindingConfig, SourceBindingConfigProtectorPort, SourceCatalogPort } from '../../ports';
import { createRollbackToken } from './accepted-topic-rollback-token';
import { expandConfigForAcceptedTopic } from './accepted-topic-source-binding-config-expander';
import type { ApplyAcceptedTopicRecommendationCommand } from './apply-accepted-topic-recommendation.command';
import type { AppliedTopicSourceBindingUpdate } from './apply-accepted-topic-recommendation.result';

export type PreparedBindingUpdate = {
  readonly result: AppliedTopicSourceBindingUpdate;
  readonly changedBinding?: SourceBinding;
  readonly event: SourceBindingConfigExpandedEvent;
};
export type ChangedBindingUpdate = PreparedBindingUpdate & {
  readonly changedBinding: SourceBinding;
};
export type AcceptedTopicBindingUpdateDependencies = {
  readonly sourceCatalog: SourceCatalogPort;
  readonly configProtector: SourceBindingConfigProtectorPort;
  readonly ids: IdGenerator;
  readonly clock: Clock;
};

export async function prepareAcceptedTopicBindingUpdate(
  command: ApplyAcceptedTopicRecommendationCommand,
  binding: SourceBinding,
  deps: AcceptedTopicBindingUpdateDependencies,
): Promise<Result<PreparedBindingUpdate, DomainError>> {
  const snapshot = binding.toSnapshot();
  const unprotected = await deps.configProtector.unprotect(
    snapshot.config as SourceBindingConfig,
  );
  const expansion = expandConfigForAcceptedTopic(
    snapshot.providerKey,
    unprotected,
    command.topicLabel,
  );

  if (!expansion.changed) {
    return ok({
      result: {
        sourceBindingId: snapshot.id,
        interestId: snapshot.interestId,
        providerKey: snapshot.providerKey,
        changed: false,
        changedConfigPaths: [],
      },
      event: configExpandedEvent(command, snapshot, [], deps),
    });
  }

  const validation = await deps.sourceCatalog.validateBindingConfig(
    snapshot.providerKey,
    expansion.config,
  );
  if (!validation.ok) {
    return err(
      new DomainError(
        "validation.failed",
        "Expanded source binding config is invalid for provider",
        {
          providerKey: snapshot.providerKey,
          reason: validation.reason,
          sourceBindingId: snapshot.id,
        },
      ),
    );
  }

  const protectedConfig = await deps.configProtector.protect(
    expansion.config,
  );
  const changedBinding = binding.reconfigure(protectedConfig);

  return ok({
    result: {
      sourceBindingId: snapshot.id,
      interestId: snapshot.interestId,
      providerKey: snapshot.providerKey,
      changed: true,
      changedConfigPaths: expansion.changedConfigPaths,
      rollbackToken: createRollbackToken({
        sourceBindingId: snapshot.id,
        previousConfig: snapshot.config as SourceBindingConfig,
        appliedConfig: protectedConfig,
        changedConfigPaths: expansion.changedConfigPaths,
      }),
    },
    changedBinding,
    event: configExpandedEvent(
      command,
      snapshot,
      expansion.changedConfigPaths,
      deps,
    ),
  });
}

function configExpandedEvent(
  command: ApplyAcceptedTopicRecommendationCommand,
  snapshot: ReturnType<SourceBinding["toSnapshot"]>,
  changedConfigPaths: readonly string[],
  deps: AcceptedTopicBindingUpdateDependencies,
): SourceBindingConfigExpandedEvent {
  return {
    eventId: eventId(deps.ids.generate()),
    eventType: "monitoring.source-binding.config-expanded",
    schemaVersion: 1,
    occurredAt: deps.clock.now(),
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
      topicLabel: command.topicLabel.trim(),
      recommendationId: command.recommendationId.trim(),
      changedConfigPaths,
    },
  };
}
