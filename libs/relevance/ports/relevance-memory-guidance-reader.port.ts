import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { RankingMemoryGuidance } from '../domain';

export const RELEVANCE_MEMORY_GUIDANCE_READER = Symbol('RELEVANCE_MEMORY_GUIDANCE_READER');

export type RelevanceMemoryGuidanceStatus =
  | 'disabled'
  | 'available'
  | 'empty'
  | 'unavailable';

export type BuildRelevanceMemoryGuidanceQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly userId: string;
  readonly providerKeys: readonly string[];
  readonly keywords: readonly string[];
  readonly requestedAt: Date;
};

export type RelevanceMemoryGuidanceResult = RankingMemoryGuidance & {
  readonly status: RelevanceMemoryGuidanceStatus;
  readonly diagnostics?: Readonly<Record<string, unknown>>;
};

export interface RelevanceMemoryGuidanceReaderPort {
  buildGuidance(query: BuildRelevanceMemoryGuidanceQuery): Promise<RelevanceMemoryGuidanceResult>;
}

export const NOOP_RELEVANCE_MEMORY_GUIDANCE_READER: RelevanceMemoryGuidanceReaderPort = {
  async buildGuidance(query) {
    return {
      status: 'disabled',
      diagnostics: {
        mode: 'disabled',
        userId: query.userId,
      },
    };
  },
};
