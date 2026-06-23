import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type {
  BriefingContextArtifact,
  BriefingEvidenceSelection,
  BriefingScope,
} from '../domain';

export type BuildBriefingContextQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope: BriefingScope;
  readonly userId?: string;
  readonly subscriptionId?: string;
  readonly evidence: BriefingEvidenceSelection;
  readonly requestedAt: Date;
};

export interface BriefingContextProviderPort {
  buildContext(query: BuildBriefingContextQuery): Promise<readonly BriefingContextArtifact[]>;
}

export const NOOP_BRIEFING_CONTEXT_PROVIDER: BriefingContextProviderPort = {
  async buildContext(): Promise<readonly BriefingContextArtifact[]> {
    return [];
  },
};
