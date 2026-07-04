import type {
  RankedSocialSearchItem,
  SocialSearchItem,
} from '../../domain/entities/social-search-item';
import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';
import type { SocialSearchPlan } from '../../domain/value-objects/social-search-plan';
import type { SocialSourceKey } from '../../domain/value-objects/social-search-intent';

export type SocialResearchExecutionScope = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scanJobId: string;
  readonly correlationId?: string;
  readonly sourceBindingIdBySource: Readonly<Record<string, string>>;
  readonly cursorByLaneId?: Readonly<Record<string, string>>;
};

export const socialResearchCacheTraceStatuses = [
  'disabled',
  'hit',
  'write_through',
] as const;

export type SocialResearchCacheTraceStatus =
  (typeof socialResearchCacheTraceStatuses)[number];

export type SocialSearchRunTrace = {
  readonly cache: {
    readonly status: SocialResearchCacheTraceStatus;
    readonly cacheKeyAvailable: boolean;
    readonly scope?: {
      readonly tenantId: TenantId;
      readonly workspaceId: WorkspaceId;
    };
  };
  readonly execution: {
    readonly gatewayInvoked: boolean;
    readonly authorizedLaneCount: number;
    readonly sourceKeys: readonly SocialSourceKey[];
  };
};

export type SocialSearchRun = {
  readonly plan: SocialSearchPlan;
  readonly items: readonly SocialSearchItem[];
  readonly rankedItems?: readonly RankedSocialSearchItem[];
  readonly warnings: readonly string[];
  readonly partial: boolean;
  readonly trace?: SocialSearchRunTrace;
};

export type ExecuteSocialSearchPlanCommand = {
  readonly plan: SocialSearchPlan;
  readonly execution?: SocialResearchExecutionScope;
  readonly correlationId?: string;
};

export type FetchSocialThreadCommand = {
  readonly canonicalUrl?: string;
  readonly sourceKey?: string;
  readonly externalId?: string;
  readonly maxDepth?: number;
  readonly execution?: SocialResearchExecutionScope;
};

export type FetchSocialThreadReaderCommand = FetchSocialThreadCommand & {
  readonly execution: SocialResearchExecutionScope;
};

export type SocialThreadUnit = {
  readonly unitId: string;
  readonly parentUnitId?: string;
  readonly authorHandle?: string;
  readonly body: string;
  readonly publishedAt?: Date;
};

export type SocialThread = {
  readonly root: SocialSearchItem;
  readonly units: readonly SocialThreadUnit[];
  readonly warnings: readonly string[];
};

export interface SocialResearchGateway {
  executeSearchPlan(
    command: ExecuteSocialSearchPlanCommand,
  ): Promise<SocialSearchRun>;
  fetchThread(command: FetchSocialThreadCommand): Promise<SocialThread>;
}

export interface SocialThreadReaderPort {
  fetchThread(command: FetchSocialThreadReaderCommand): Promise<SocialThread>;
}
