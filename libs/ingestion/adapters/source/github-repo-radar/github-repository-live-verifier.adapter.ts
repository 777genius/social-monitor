import type { GitHubRepositoryDetailsClientPort } from '../github/github-client.port';
import type {
  GitHubRepositoryLiveRecord,
  GitHubRepositoryLiveVerificationRequest,
  GitHubRepositoryLiveVerifierPort,
} from './github-repository-live-verifier.port';

export class GitHubRepositoryLiveVerifierAdapter implements GitHubRepositoryLiveVerifierPort {
  constructor(private readonly client: GitHubRepositoryDetailsClientPort) {}

  async verifyRepository(
    request: GitHubRepositoryLiveVerificationRequest,
  ): Promise<GitHubRepositoryLiveRecord | null> {
    const repository = await this.client.getRepository(request);

    if (repository === null) {
      return null;
    }

    return {
      fullName: repository.fullName,
      url: repository.htmlUrl,
      description: repository.description,
      language: repository.language,
      topics: repository.topics,
      license: repository.licenseSpdxId,
      totalStars: repository.stargazersCount,
      forksCount: repository.forksCount,
      fork: repository.fork,
      archived: repository.archived,
      pushedAt: readDate(repository.pushedAt),
      updatedAt: readDate(repository.updatedAt),
    };
  }
}

const readDate = (value: string | undefined): Date | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};
