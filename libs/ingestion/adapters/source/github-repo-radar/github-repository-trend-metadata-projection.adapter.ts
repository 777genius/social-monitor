import { parseGitHubRepositoryTrendMetadata } from '../../../domain';
import type {
  GitHubRepositoryTrendHistoryRecord,
  GitHubRepositoryTrendHistoryRepositoryPort,
  ProjectSourceItemMetadataCommand,
  ProjectSourceItemMetadataResult,
  SourceItemMetadataProjectionPort,
} from '../../../ports';

export class GitHubRepositoryTrendMetadataProjectionAdapter implements SourceItemMetadataProjectionPort {
  constructor(private readonly repository: GitHubRepositoryTrendHistoryRepositoryPort) {}

  async project(command: ProjectSourceItemMetadataCommand): Promise<ProjectSourceItemMetadataResult> {
    const records: GitHubRepositoryTrendHistoryRecord[] = [];

    for (const sourceItem of command.sourceItems) {
      const snapshot = sourceItem.toSnapshot();
      const metadata = parseGitHubRepositoryTrendMetadata(snapshot.metadata);

      if (metadata === null) {
        continue;
      }

      records.push({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        topicId: command.topicId,
        sourceBindingId: command.sourceBindingId,
        scanJobId: command.scanJobId,
        sourceItemId: snapshot.id,
        repositoryFullName: metadata.repository.fullName,
        repositoryUrl: metadata.repository.url,
        description: metadata.repository.description,
        language: metadata.repository.language,
        topics: metadata.repository.topics,
        license: metadata.repository.license,
        totalStars: metadata.trend.totalStars,
        stars24h: metadata.trend.stars24h,
        stars7d: metadata.trend.stars7d,
        stars30d: metadata.trend.stars30d,
        stars90d: metadata.trend.stars90d,
        rank: metadata.trend.rank,
        primaryWindow: metadata.trend.primaryWindow,
        checkedAt: new Date(metadata.trend.checkedAt),
        observedAt: snapshot.ingestedAt,
        source: metadata.trend.source,
        metadata: snapshot.metadata ?? {},
      });
    }

    if (records.length === 0) {
      return { projected: 0 };
    }

    const result = await this.repository.saveBatch({ records });

    return { projected: result.saved };
  }
}
