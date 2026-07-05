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
} from "@social-monitor/shared-kernel";

import {
  type SourceBinding,
  type SourceBindingConfigExpandedEvent,
  type SourceBindingConfigExpansionRevertedEvent,
} from "../../domain";
import type {
  IdempotencyPort,
  OutboxPort,
  SourceBindingConfig,
  SourceBindingConfigProtectorPort,
  SourceBindingRepositoryPort,
  SourceCatalogPort,
} from "../../ports";
import {
  createRollbackToken,
  parseRollbackToken,
  sameConfig,
  type SourceBindingConfigRollbackToken,
} from "./accepted-topic-rollback-token";
import {
  uniqueNormalized,
  validateApplyAcceptedTopicRecommendationCommand,
  validateRevertAcceptedTopicRecommendationCommand,
} from "./accepted-topic-recommendation-validation";
import { expandConfigForAcceptedTopic } from "./accepted-topic-source-binding-config-expander";
import type {
  ApplyAcceptedTopicRecommendationCommand,
  RevertAcceptedTopicRecommendationCommand,
} from "./apply-accepted-topic-recommendation.command";
import type {
  AppliedTopicSourceBindingUpdate,
  ApplyAcceptedTopicRecommendationResult,
  RevertedTopicSourceBindingUpdate,
  RevertAcceptedTopicRecommendationResult,
} from "./apply-accepted-topic-recommendation.result";

type ApplyAcceptedTopicRecommendationFailure = DomainError | Error;
type PreparedBindingUpdate = {
  readonly result: AppliedTopicSourceBindingUpdate;
  readonly changedBinding?: SourceBinding;
  readonly event: SourceBindingConfigExpandedEvent;
};
type ChangedBindingUpdate = PreparedBindingUpdate & {
  readonly changedBinding: SourceBinding;
};

const supportedProviderKeys = new Set([
  "hacker-news",
  "reddit",
  "rss",
  "x-twitter",
]);

export class ApplyAcceptedTopicRecommendationUseCase {
  constructor(
    private readonly sourceBindings: SourceBindingRepositoryPort,
    private readonly sourceCatalog: SourceCatalogPort,
    private readonly outbox: OutboxPort,
    private readonly idempotency: IdempotencyPort,
    private readonly configProtector: SourceBindingConfigProtectorPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: ApplyAcceptedTopicRecommendationCommand,
  ): Promise<
    Result<
      ApplyAcceptedTopicRecommendationResult,
      ApplyAcceptedTopicRecommendationFailure
    >
  > {
    const validation = validateApplyAcceptedTopicRecommendationCommand(command);
    if (!validation.ok) {
      return err(validation.error);
    }

    const cached =
      await this.idempotency.get<ApplyAcceptedTopicRecommendationResult>({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        scope: "monitoring.apply-accepted-topic-recommendation",
        key: command.idempotencyKey,
      });
    if (cached) {
      return ok(cached.value);
    }

    const bindings = await this.listSupportedBindings(command);
    if (bindings.length === 0) {
      const result: ApplyAcceptedTopicRecommendationResult = {
        status: "no_supported_bindings",
        changedSourceBindingCount: 0,
        sourceBindingUpdates: [],
      };
      await this.cacheResult(command, result);

      return ok(result);
    }

    const prepared: PreparedBindingUpdate[] = [];
    for (const binding of bindings) {
      const update = await this.prepareBindingUpdate(command, binding);
      if (!update.ok) {
        return err(update.error);
      }

      prepared.push(update.value);
    }
    const changed = prepared.filter(hasChangedBinding);

    for (const update of changed) {
      await this.sourceBindings.save(update.changedBinding);
      await this.outbox.append(update.event);
    }

    const result: ApplyAcceptedTopicRecommendationResult = {
      status: changed.length > 0 ? "applied" : "already_applied",
      changedSourceBindingCount: changed.length,
      sourceBindingUpdates: prepared.map((update) => update.result),
    };
    await this.cacheResult(command, result);

    return ok(result);
  }

  async revert(
    command: RevertAcceptedTopicRecommendationCommand,
  ): Promise<
    Result<RevertAcceptedTopicRecommendationResult, DomainError | Error>
  > {
    const validation = validateRevertAcceptedTopicRecommendationCommand(command);
    if (!validation.ok) {
      return err(validation.error);
    }

    const cached =
      await this.idempotency.get<RevertAcceptedTopicRecommendationResult>({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        scope: "monitoring.revert-accepted-topic-recommendation",
        key: command.idempotencyKey,
      });
    if (cached) {
      return ok(cached.value);
    }

    const reversions: RevertedTopicSourceBindingUpdate[] = [];
    for (const update of command.sourceBindingUpdates) {
      const reversion = await this.revertBindingUpdate(command, update);
      if (!reversion.ok) {
        return err(reversion.error);
      }

      reversions.push(reversion.value);
    }

    const revertedCount = reversions.filter(
      (reversion) => reversion.reverted,
    ).length;
    const blockedCount = reversions.filter(
      (reversion) => !reversion.reverted && reversion.reason === "config_changed",
    ).length;
    const result: RevertAcceptedTopicRecommendationResult = {
      status:
        revertedCount === 0
          ? blockedCount > 0
            ? "blocked"
            : "nothing_to_revert"
          : revertedCount === reversions.length
            ? "reverted"
            : "partially_reverted",
      revertedSourceBindingCount: revertedCount,
      sourceBindingReversions: reversions,
    };

    await this.idempotency.set({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scope: "monitoring.revert-accepted-topic-recommendation",
      key: command.idempotencyKey,
      value: result,
    });

    return ok(result);
  }

  private async listSupportedBindings(
    command: ApplyAcceptedTopicRecommendationCommand,
  ): Promise<readonly SourceBinding[]> {
    const providerFilter = command.providerKeys
      ?.map((providerKey) => providerKey.trim())
      .filter((providerKey) => providerKey.length > 0);
    const requestedProviders =
      providerFilter === undefined || providerFilter.length === 0
        ? undefined
        : new Set(providerFilter);
    const bindings: SourceBinding[] = [];

    for (const interestId of uniqueNormalized(command.interestIds)) {
      let cursor: string | undefined;

      do {
        const page = await this.sourceBindings.listByInterest({
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          interestId,
          limit: 100,
          cursor,
        });

        for (const binding of page.sourceBindings) {
          const snapshot = binding.toSnapshot();
          const providerAllowed =
            requestedProviders === undefined ||
            requestedProviders.has(snapshot.providerKey);

          if (
            providerAllowed &&
            supportedProviderKeys.has(snapshot.providerKey)
          ) {
            bindings.push(binding);
          }
        }

        cursor = page.nextCursor;
      } while (cursor !== undefined);
    }

    return bindings;
  }

  private async prepareBindingUpdate(
    command: ApplyAcceptedTopicRecommendationCommand,
    binding: SourceBinding,
  ): Promise<Result<PreparedBindingUpdate, DomainError>> {
    const snapshot = binding.toSnapshot();
    const unprotected = await this.configProtector.unprotect(
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
        event: this.configExpandedEvent(command, snapshot, []),
      });
    }

    const validation = await this.sourceCatalog.validateBindingConfig(
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

    const protectedConfig = await this.configProtector.protect(
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
      event: this.configExpandedEvent(
        command,
        snapshot,
        expansion.changedConfigPaths,
      ),
    });
  }

  private configExpandedEvent(
    command: ApplyAcceptedTopicRecommendationCommand,
    snapshot: ReturnType<SourceBinding["toSnapshot"]>,
    changedConfigPaths: readonly string[],
  ): SourceBindingConfigExpandedEvent {
    return {
      eventId: eventId(this.ids.generate()),
      eventType: "monitoring.source-binding.config-expanded",
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
        topicLabel: command.topicLabel.trim(),
        recommendationId: command.recommendationId.trim(),
        changedConfigPaths,
      },
    };
  }

  private async revertBindingUpdate(
    command: RevertAcceptedTopicRecommendationCommand,
    update: RevertAcceptedTopicRecommendationCommand["sourceBindingUpdates"][number],
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

    const binding = await this.sourceBindings.findById({
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

    await this.sourceBindings.save(binding.reconfigure(rollbackToken.previousConfig));
    await this.outbox.append(
      this.configExpansionRevertedEvent(command, snapshot, rollbackToken),
    );

    return ok({
      sourceBindingId: update.sourceBindingId,
      interestId: update.interestId,
      providerKey: update.providerKey,
      reverted: true,
      restoredConfigPaths: rollbackToken.changedConfigPaths,
    });
  }

  private configExpansionRevertedEvent(
    command: RevertAcceptedTopicRecommendationCommand,
    snapshot: ReturnType<SourceBinding["toSnapshot"]>,
    rollbackToken: SourceBindingConfigRollbackToken,
  ): SourceBindingConfigExpansionRevertedEvent {
    return {
      eventId: eventId(this.ids.generate()),
      eventType: "monitoring.source-binding.config-expansion-reverted",
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
        topicLabel: command.topicLabel.trim(),
        recommendationId: command.recommendationId.trim(),
        restoredConfigPaths: rollbackToken.changedConfigPaths,
      },
    };
  }

  private async cacheResult(
    command: ApplyAcceptedTopicRecommendationCommand,
    result: ApplyAcceptedTopicRecommendationResult,
  ): Promise<void> {
    await this.idempotency.set({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scope: "monitoring.apply-accepted-topic-recommendation",
      key: command.idempotencyKey,
      value: result,
    });
  }
}

const hasChangedBinding = (
  update: PreparedBindingUpdate,
): update is ChangedBindingUpdate => update.changedBinding !== undefined;
