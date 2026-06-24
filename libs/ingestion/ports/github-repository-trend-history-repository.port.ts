import type { JsonObject, TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type GitHubRepositoryTrendHistoryRecord = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly topicId: string;
  readonly sourceBindingId: string;
  readonly scanJobId: string;
  readonly sourceItemId: string;
  readonly repositoryFullName: string;
  readonly repositoryUrl: string;
  readonly description?: string;
  readonly language?: string;
  readonly topics: readonly string[];
  readonly license?: string;
  readonly totalStars: number;
  readonly stars24h: number;
  readonly stars48h: number;
  readonly stars7d: number;
  readonly stars30d: number;
  readonly stars90d: number;
  readonly rank: number;
  readonly primaryWindow: string;
  readonly checkedAt: Date;
  readonly observedAt: Date;
  readonly source: string;
  readonly metadata: JsonObject;
};

export type SaveGitHubRepositoryTrendHistoryCommand = {
  readonly records: readonly GitHubRepositoryTrendHistoryRecord[];
};

export type SaveGitHubRepositoryTrendHistoryResult = {
  readonly saved: number;
};

export interface GitHubRepositoryTrendHistoryRepositoryPort {
  saveBatch(
    command: SaveGitHubRepositoryTrendHistoryCommand,
  ): Promise<SaveGitHubRepositoryTrendHistoryResult>;
}
