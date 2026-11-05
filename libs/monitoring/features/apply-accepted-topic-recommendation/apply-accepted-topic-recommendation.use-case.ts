import { type Clock, type DomainError, type IdGenerator, err, ok, type Result } from '@social-monitor/shared-kernel';
import type { SourceBinding } from '../../domain';
import type {
  IdempotencyPort,
  OutboxPort,
  SourceBindingConfigProtectorPort,
  SourceBindingRepositoryPort,
  SourceCatalogPort,
} from '../../ports';
import { uniqueNormalized, validateApplyAcceptedTopicRecommendationCommand, validateRevertAcceptedTopicRecommendationCommand } from './accepted-topic-recommendation-validation';
import { prepareAcceptedTopicBindingUpdate, type PreparedBindingUpdate, type ChangedBindingUpdate } from './prepare-accepted-topic-binding-update';
import { revertAcceptedTopicBindingUpdate } from './revert-accepted-topic-binding-update';
import type { ApplyAcceptedTopicRecommendationCommand, RevertAcceptedTopicRecommendationCommand } from './apply-accepted-topic-recommendation.command';
import type {
  ApplyAcceptedTopicRecommendationResult,
  RevertedTopicSourceBindingUpdate,
  RevertAcceptedTopicRecommendationResult,
} from './apply-accepted-topic-recommendation.result';

type ApplyAcceptedTopicRecommendationFailure = DomainError | Error;
const supportedProviderKeys = new Set(['hacker-news', 'reddit', 'rss', 'x-twitter']);

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
      const update = await prepareAcceptedTopicBindingUpdate(command, binding, {
        sourceCatalog: this.sourceCatalog,
        configProtector: this.configProtector,
        ids: this.ids,
        clock: this.clock,
      });
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
      const reversion = await revertAcceptedTopicBindingUpdate(command, update, {
        sourceBindings: this.sourceBindings,
        outbox: this.outbox,
        ids: this.ids,
        clock: this.clock,
      });
      if (!reversion.ok) {
        return err(reversion.error);
      }

      reversions.push(reversion.value);
    }

    const revertedCount = reversions.filter(
      (reversion) => reversion.reverted,
    ).length;
    const blockedCount = reversions.filter(
      (reversion) => !reversion.reverted && (reversion.reason === "config_changed" ||
        reversion.reason === "rollback_token_mismatch"),
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
