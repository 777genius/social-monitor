import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type {
  ReaderSummaryContextArtifact,
  ReaderSummaryScope,
  SummaryEvidenceSelection,
} from "../domain";

export type BuildReaderSummaryContextQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope: ReaderSummaryScope;
  readonly userId?: string;
  readonly subscriptionId?: string;
  readonly evidence: SummaryEvidenceSelection;
  readonly requestedAt: Date;
};

export interface ReaderSummaryContextProviderPort {
  buildContext(
    query: BuildReaderSummaryContextQuery,
  ): Promise<readonly ReaderSummaryContextArtifact[]>;
}

export const NOOP_READER_SUMMARY_CONTEXT_PROVIDER: ReaderSummaryContextProviderPort =
  {
    async buildContext(): Promise<readonly ReaderSummaryContextArtifact[]> {
      return [];
    },
  };
