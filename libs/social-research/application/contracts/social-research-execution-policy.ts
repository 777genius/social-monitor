import type {
  FetchSocialThreadCommand,
  SocialResearchExecutionScope,
  SocialSearchRun,
  SocialThread,
} from './social-research-gateway';
import type { SocialSearchPlan } from '../../domain/value-objects/social-search-plan';

export type SocialResearchResultCacheScope = {
  readonly tenantId: SocialResearchExecutionScope['tenantId'];
  readonly workspaceId: SocialResearchExecutionScope['workspaceId'];
};

export type SocialResearchExecutionPolicyDecision =
  | {
      readonly allowed: true;
      readonly cacheKey?: string;
      readonly cacheScope?: SocialResearchResultCacheScope;
    }
  | {
      readonly allowed: false;
      readonly reason: string;
      readonly retryAfterMs?: number;
    };

export type SocialResearchSearchPolicyCommand = {
  readonly plan: SocialSearchPlan;
  readonly execution?: SocialResearchExecutionScope;
};

export type SocialResearchThreadPolicyCommand = {
  readonly command: FetchSocialThreadCommand;
};

export interface SocialResearchExecutionPolicyPort {
  authorizeSearch(
    command: SocialResearchSearchPolicyCommand,
  ): Promise<SocialResearchExecutionPolicyDecision>;
  authorizeThreadFetch(
    command: SocialResearchThreadPolicyCommand,
  ): Promise<SocialResearchExecutionPolicyDecision>;
}

export interface SocialResearchResultCachePort {
  readSearch(
    cacheKey: string,
    scope?: SocialResearchResultCacheScope,
  ): Promise<SocialSearchRun | null>;
  writeSearch(
    cacheKey: string,
    run: SocialSearchRun,
    scope?: SocialResearchResultCacheScope,
  ): Promise<void>;
  readThread(
    cacheKey: string,
    scope?: SocialResearchResultCacheScope,
  ): Promise<SocialThread | null>;
  writeThread(
    cacheKey: string,
    thread: SocialThread,
    scope?: SocialResearchResultCacheScope,
  ): Promise<void>;
}
