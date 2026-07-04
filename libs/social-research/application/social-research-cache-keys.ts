import { createHash } from 'node:crypto';

import type {
  FetchSocialThreadCommand,
  SocialResearchExecutionScope,
} from './contracts/social-research-gateway';
import type { SocialResearchSearchPolicyCommand } from './contracts/social-research-execution-policy';
import type { SocialSearchLane } from '../domain/value-objects/social-search-plan';

export interface SocialResearchCacheKeyHasherPort {
  hash(value: string): string;
}

export type SocialResearchCacheKeyBuilderOptions = {
  readonly namespace?: string;
  readonly hasher?: SocialResearchCacheKeyHasherPort;
};

export class Sha256SocialResearchCacheKeyHasher
  implements SocialResearchCacheKeyHasherPort
{
  hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}

export class SocialResearchCacheKeyBuilder {
  private readonly namespace: string;
  private readonly hasher: SocialResearchCacheKeyHasherPort;

  constructor(options: SocialResearchCacheKeyBuilderOptions = {}) {
    this.namespace = options.namespace ?? 'social-research';
    this.hasher = options.hasher ?? new Sha256SocialResearchCacheKeyHasher();
  }

  search(command: SocialResearchSearchPolicyCommand): string {
    return this.key('search', {
      execution: executionCacheScope(command.execution),
      plan: {
        normalizedTopic: command.plan.normalizedTopic,
        window: command.plan.window,
        depth: command.plan.depth,
        goal: command.plan.goal,
        lanes: command.plan.lanes.map(laneCacheScope),
        budgets: command.plan.budgets.map((budget) => ({
          sourceKey: budget.sourceKey,
          maxLanes: budget.maxLanes,
          maxItemsPerLane: budget.maxItemsPerLane,
          includeEnrichment: budget.includeEnrichment,
        })),
      },
    });
  }

  thread(command: FetchSocialThreadCommand): string {
    return this.key('thread', {
      execution: executionCacheScope(command.execution),
      thread: {
        canonicalUrl: command.canonicalUrl,
        sourceKey: command.sourceKey,
        externalId: command.externalId,
        maxDepth: command.maxDepth,
      },
    });
  }

  private key(kind: 'search' | 'thread', payload: unknown): string {
    const digest = this.hasher.hash(stableStringify({ kind, payload }));

    return `${this.namespace}:v1:${kind}:${digest}`;
  }
}

const executionCacheScope = (
  execution: SocialResearchExecutionScope | undefined,
) =>
  execution === undefined
    ? undefined
    : {
        tenantId: execution.tenantId,
        workspaceId: execution.workspaceId,
        scanJobId: execution.scanJobId,
        sourceBindingIdBySource: execution.sourceBindingIdBySource,
        cursorByLaneId: execution.cursorByLaneId,
      };

const laneCacheScope = (lane: SocialSearchLane) => ({
  laneId: lane.laneId,
  sourceKey: lane.sourceKey,
  kind: lane.kind,
  operation: lane.operation,
  query: lane.query,
  maxItems: lane.maxItems,
  parameters: lane.parameters,
  dependsOnLaneIds: lane.dependsOnLaneIds,
});

const stableStringify = (value: unknown): string =>
  JSON.stringify(stableValue(value));

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }

  return value;
};
