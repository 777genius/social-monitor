import type {
  GitHubRepositoryTrendHistoryRecord,
  GitHubRepositoryTrendHistoryRepositoryPort,
  SaveGitHubRepositoryTrendHistoryCommand,
  SaveGitHubRepositoryTrendHistoryResult,
} from '../../ports';

export class InMemoryGitHubRepositoryTrendHistoryRepository implements GitHubRepositoryTrendHistoryRepositoryPort {
  private readonly recordsByKey = new Map<string, GitHubRepositoryTrendHistoryRecord>();

  async saveBatch(
    command: SaveGitHubRepositoryTrendHistoryCommand,
  ): Promise<SaveGitHubRepositoryTrendHistoryResult> {
    for (const record of command.records) {
      this.recordsByKey.set(historyKey(record), record);
    }

    return { saved: command.records.length };
  }

  all(): readonly GitHubRepositoryTrendHistoryRecord[] {
    return [...this.recordsByKey.values()];
  }
}

const historyKey = (record: GitHubRepositoryTrendHistoryRecord): string =>
  [
    record.tenantId,
    record.workspaceId,
    record.scanJobId,
    record.repositoryFullName,
    record.primaryWindow,
  ].join(':');
