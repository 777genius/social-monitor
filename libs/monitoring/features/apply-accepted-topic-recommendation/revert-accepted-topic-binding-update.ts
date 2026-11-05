import { DomainError, type Clock, type IdGenerator, causationId, correlationId, eventId, ok, type Result } from '@social-monitor/shared-kernel';
import type { SourceBinding, SourceBindingConfigExpansionRevertedEvent } from '../../domain';
import type { OutboxPort, SourceBindingRepositoryPort } from '../../ports';
import { parseRollbackToken, sameConfig, type SourceBindingConfigRollbackToken } from './accepted-topic-rollback-token';
import type { RevertAcceptedTopicRecommendationCommand } from './apply-accepted-topic-recommendation.command';
import type { RevertedTopicSourceBindingUpdate } from './apply-accepted-topic-recommendation.result';

export type RevertAcceptedTopicBindingUpdateDependencies = {
  readonly sourceBindings: SourceBindingRepositoryPort;
  readonly outbox: OutboxPort;
  readonly ids: IdGenerator;
  readonly clock: Clock;
};

export async function revertAcceptedTopicBindingUpdate(
  command: RevertAcceptedTopicRecommendationCommand,
  update: RevertAcceptedTopicRecommendationCommand["sourceBindingUpdates"][number],
  deps: RevertAcceptedTopicBindingUpdateDependencies,
): Promise<Result<RevertedTopicSourceBindingUpdate, DomainError>> {
  if (!update.changed) {
    return ok({
      sourceBindingId: update.sourceBindingId,
      interestId: update.interestId,
      providerKey: update.providerKey,
      reverted: false,
      reason: "not_changed",
      restoredConfigPaths: [],
    });
  }

  const rollbackToken = parseRollbackToken(update.rollbackToken);
  if (rollbackToken === null) {
    return ok({
      sourceBindingId: update.sourceBindingId,
      interestId: update.interestId,
      providerKey: update.providerKey,
      reverted: false,
      reason: "missing_rollback_token",
      restoredConfigPaths: [],
    });
  }

  const binding = await deps.sourceBindings.findById({
    tenantId: command.tenantId,
    workspaceId: command.workspaceId,
    sourceBindingId: update.sourceBindingId,
  });
  if (binding === null) {
    return ok({
      sourceBindingId: update.sourceBindingId,
      interestId: update.interestId,
      providerKey: update.providerKey,
      reverted: false,
      reason: "source_binding_missing",
      restoredConfigPaths: [],
    });
  }

  const snapshot = binding.toSnapshot();
  if (!sameConfig(snapshot.config, rollbackToken.appliedConfig)) {
    return ok({
      sourceBindingId: update.sourceBindingId,
      interestId: update.interestId,
      providerKey: update.providerKey,
      reverted: false,
      reason: "config_changed",
      restoredConfigPaths: [],
    });
  }

  await deps.sourceBindings.save(binding.reconfigure(rollbackToken.previousConfig));
  await deps.outbox.append(
    configExpansionRevertedEvent(command, snapshot, rollbackToken, deps),
  );

  return ok({
    sourceBindingId: update.sourceBindingId,
    interestId: update.interestId,
    providerKey: update.providerKey,
    reverted: true,
    restoredConfigPaths: rollbackToken.changedConfigPaths,
  });
}

function configExpansionRevertedEvent(
  command: RevertAcceptedTopicRecommendationCommand,
  snapshot: ReturnType<SourceBinding["toSnapshot"]>,
  rollbackToken: SourceBindingConfigRollbackToken,
  deps: RevertAcceptedTopicBindingUpdateDependencies,
): SourceBindingConfigExpansionRevertedEvent {
  return {
    eventId: eventId(deps.ids.generate()),
    eventType: "monitoring.source-binding.config-expansion-reverted",
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
      restoredConfigPaths: rollbackToken.changedConfigPaths,
    },
  };
}
