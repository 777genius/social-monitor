export type GitHubRepositoryLiveVerificationRequest = {
  readonly fullName: string;
  readonly accessToken?: string;
  readonly userAgent?: string;
};

export type GitHubRepositoryLiveRecord = {
  readonly fullName: string;
  readonly url: string;
  readonly description?: string;
  readonly language?: string;
  readonly topics: readonly string[];
  readonly license?: string;
  readonly totalStars: number;
  readonly fork: boolean;
  readonly archived: boolean;
  readonly pushedAt?: Date;
  readonly updatedAt?: Date;
};

export interface GitHubRepositoryLiveVerifierPort {
  verifyRepository(
    request: GitHubRepositoryLiveVerificationRequest,
  ): Promise<GitHubRepositoryLiveRecord | null>;
}
