import type {
  SocialResearchExecutionPolicyDecision,
  SocialResearchExecutionPolicyPort,
  SocialResearchSearchPolicyCommand,
  SocialResearchThreadPolicyCommand,
} from './contracts/social-research-execution-policy';
import type { SocialSourceKey } from '../domain/value-objects/social-search-intent';
import {
  builtInSocialSourceCapabilityProfiles,
  type SocialSourceCapabilityProfile,
  type SocialSourceRuntimeReadinessState,
} from '../domain/value-objects/social-source-capability-profile';
import { SocialResearchCacheKeyBuilder } from './social-research-cache-keys';

export type DefaultSocialResearchExecutionPolicyOptions = {
  readonly requireExecutionScope?: boolean;
  readonly requireSourceBindings?: boolean;
  readonly requireSourceRuntimeReadiness?: boolean;
  readonly allowSourcesWithoutReadinessProfile?: boolean;
  readonly allowedRuntimeReadiness?: readonly SocialSourceRuntimeReadinessState[];
  readonly sourceCapabilities?: readonly SocialSourceCapabilityProfile[];
  readonly allowedSources?: readonly SocialSourceKey[];
  readonly maxLanes?: number;
  readonly maxItemsPerLane?: number;
  readonly includeCacheKeys?: boolean;
  readonly cacheKeyBuilder?: SocialResearchCacheKeyBuilder;
};

export class DefaultSocialResearchExecutionPolicy implements SocialResearchExecutionPolicyPort {
  private readonly requireExecutionScope: boolean;
  private readonly requireSourceBindings: boolean;
  private readonly requireSourceRuntimeReadiness: boolean;
  private readonly allowSourcesWithoutReadinessProfile: boolean;
  private readonly includeCacheKeys: boolean;
  private readonly allowedSources: ReadonlySet<string> | undefined;
  private readonly allowedRuntimeReadiness: ReadonlySet<SocialSourceRuntimeReadinessState>;
  private readonly sourceCapabilityBySource: ReadonlyMap<
    SocialSourceKey,
    SocialSourceCapabilityProfile
  >;
  private readonly cacheKeyBuilder: SocialResearchCacheKeyBuilder;

  constructor(
    private readonly options: DefaultSocialResearchExecutionPolicyOptions = {},
  ) {
    this.requireExecutionScope = options.requireExecutionScope ?? true;
    this.requireSourceBindings = options.requireSourceBindings ?? true;
    this.requireSourceRuntimeReadiness =
      options.requireSourceRuntimeReadiness ?? true;
    this.allowSourcesWithoutReadinessProfile =
      options.allowSourcesWithoutReadinessProfile ?? false;
    this.includeCacheKeys = options.includeCacheKeys ?? true;
    this.allowedSources =
      options.allowedSources === undefined
        ? undefined
        : new Set(options.allowedSources);
    this.allowedRuntimeReadiness = new Set(
      options.allowedRuntimeReadiness ?? ['fixture_ready', 'live_beta_ready'],
    );
    this.sourceCapabilityBySource = new Map(
      [
        ...builtInSocialSourceCapabilityProfiles,
        ...(options.sourceCapabilities ?? []),
      ].map((profile) => [profile.sourceKey, profile]),
    );
    this.cacheKeyBuilder =
      options.cacheKeyBuilder ?? new SocialResearchCacheKeyBuilder();
  }

  async authorizeSearch(
    command: SocialResearchSearchPolicyCommand,
  ): Promise<SocialResearchExecutionPolicyDecision> {
    const executionDenial = denyMissingExecutionScope(
      this.requireExecutionScope,
      command.execution,
    );
    if (executionDenial !== undefined) {
      return executionDenial;
    }

    const sourceKeys = compactUnique(
      command.plan.lanes.map((lane) => lane.sourceKey),
    );
    const sourceDenial = this.denyUnsupportedSources(sourceKeys);
    if (sourceDenial !== undefined) {
      return sourceDenial;
    }

    const readinessDenial = this.denyUnreadySources(sourceKeys);
    if (readinessDenial !== undefined) {
      return readinessDenial;
    }

    const bindingDenial = denyMissingSourceBindings({
      enabled: this.requireSourceBindings,
      sourceKeys,
      sourceBindingIdBySource: command.execution?.sourceBindingIdBySource,
    });
    if (bindingDenial !== undefined) {
      return bindingDenial;
    }

    if (
      this.options.maxLanes !== undefined &&
      command.plan.lanes.length > this.options.maxLanes
    ) {
      return deny(
        `Search plan exceeds max lane count ${this.options.maxLanes}.`,
      );
    }

    const overLimitLane = command.plan.lanes.find(
      (lane) =>
        this.options.maxItemsPerLane !== undefined &&
        lane.maxItems > this.options.maxItemsPerLane,
    );
    if (overLimitLane !== undefined) {
      return deny(
        `${overLimitLane.sourceKey}/${overLimitLane.kind} exceeds max items per lane ${this.options.maxItemsPerLane}.`,
      );
    }

    return {
      allowed: true,
      ...(this.includeCacheKeys
        ? {
            cacheKey: this.cacheKeyBuilder.search(command),
            cacheScope: cacheScopeFromExecution(command.execution),
          }
        : {}),
    };
  }

  async authorizeThreadFetch(
    command: SocialResearchThreadPolicyCommand,
  ): Promise<SocialResearchExecutionPolicyDecision> {
    const executionDenial = denyMissingExecutionScope(
      this.requireExecutionScope,
      command.command.execution,
    );
    if (executionDenial !== undefined) {
      return executionDenial;
    }

    const sourceKeys =
      command.command.sourceKey === undefined
        ? []
        : [command.command.sourceKey];
    const sourceDenial = this.denyUnsupportedSources(sourceKeys);
    if (sourceDenial !== undefined) {
      return sourceDenial;
    }

    const readinessDenial = this.denyUnreadySources(sourceKeys);
    if (readinessDenial !== undefined) {
      return readinessDenial;
    }

    const bindingDenial = denyMissingSourceBindings({
      enabled: this.requireSourceBindings,
      sourceKeys,
      sourceBindingIdBySource:
        command.command.execution?.sourceBindingIdBySource,
    });
    if (bindingDenial !== undefined) {
      return bindingDenial;
    }

    return {
      allowed: true,
      ...(this.includeCacheKeys
        ? {
            cacheKey: this.cacheKeyBuilder.thread(command.command),
            cacheScope: cacheScopeFromExecution(command.command.execution),
          }
        : {}),
    };
  }

  private denyUnsupportedSources(
    sourceKeys: readonly string[],
  ): SocialResearchExecutionPolicyDecision | undefined {
    if (this.allowedSources === undefined) {
      return undefined;
    }

    const deniedSource = sourceKeys.find(
      (sourceKey) => !this.allowedSources?.has(sourceKey),
    );

    return deniedSource === undefined
      ? undefined
      : deny(`Source is not allowed for social research: ${deniedSource}.`);
  }

  private denyUnreadySources(
    sourceKeys: readonly SocialSourceKey[],
  ): SocialResearchExecutionPolicyDecision | undefined {
    if (!this.requireSourceRuntimeReadiness) {
      return undefined;
    }

    for (const sourceKey of sourceKeys) {
      const capability = this.sourceCapabilityBySource.get(sourceKey);
      const readiness = capability?.readiness;

      if (readiness === undefined) {
        if (this.allowSourcesWithoutReadinessProfile) {
          continue;
        }

        return deny(
          `Source readiness profile is required for social research source ${sourceKey}.`,
        );
      }

      if (readiness.state === 'rejected') {
        return deny(
          `Source is rejected for social research execution: ${sourceKey}.`,
        );
      }

      if (!this.allowedRuntimeReadiness.has(readiness.runtimeReadiness)) {
        return deny(
          `Source ${sourceKey} is not ready for social research execution: runtimeReadiness=${readiness.runtimeReadiness}.`,
        );
      }
    }

    return undefined;
  }
}

const denyMissingExecutionScope = (
  enabled: boolean,
  execution: unknown,
): SocialResearchExecutionPolicyDecision | undefined =>
  enabled && execution === undefined
    ? deny('Execution scope is required for social research.')
    : undefined;

const denyMissingSourceBindings = (params: {
  readonly enabled: boolean;
  readonly sourceKeys: readonly string[];
  readonly sourceBindingIdBySource:
    Readonly<Record<string, string>> | undefined;
}): SocialResearchExecutionPolicyDecision | undefined => {
  if (!params.enabled) {
    return undefined;
  }

  const missingSource = params.sourceKeys.find((sourceKey) =>
    params.sourceBindingIdBySource?.[sourceKey]?.trim().length !== undefined
      ? params.sourceBindingIdBySource[sourceKey].trim().length === 0
      : true,
  );

  return missingSource === undefined
    ? undefined
    : deny(
        `Source binding is required for social research source ${missingSource}.`,
      );
};

const deny = (reason: string): SocialResearchExecutionPolicyDecision => ({
  allowed: false,
  reason,
});

const cacheScopeFromExecution = (
  execution: SocialResearchSearchPolicyCommand['execution'],
) =>
  execution === undefined
    ? undefined
    : {
        tenantId: execution.tenantId,
        workspaceId: execution.workspaceId,
      };

const compactUnique = <T>(values: readonly T[]): readonly T[] => [
  ...new Set(values),
];
