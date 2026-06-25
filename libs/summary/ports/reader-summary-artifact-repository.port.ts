import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type { ReaderSummaryArtifact, ReaderSummaryScope } from "../domain";

export type ListReaderSummaryArtifactsQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope?: ReaderSummaryScope;
  readonly limit: number;
  readonly cursor?: string;
};

export type ListReaderSummaryArtifactsResult = {
  readonly items: readonly ReaderSummaryArtifact[];
  readonly nextCursor?: string;
};

export interface ReaderSummaryArtifactRepositoryPort {
  save(artifact: ReaderSummaryArtifact): Promise<void>;
  list(
    query: ListReaderSummaryArtifactsQuery,
  ): Promise<ListReaderSummaryArtifactsResult>;
  findById(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly readerSummaryId: string;
  }): Promise<ReaderSummaryArtifact | null>;
}
