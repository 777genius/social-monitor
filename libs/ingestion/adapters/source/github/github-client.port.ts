export type GitHubIssueSearchItem = {
  readonly id?: number;
  readonly nodeId?: string;
  readonly htmlUrl?: string;
  readonly title?: string;
  readonly body?: string;
  readonly userLogin?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly state?: string;
  readonly isPullRequest?: boolean;
};

export type GitHubIssueSearchPage = {
  readonly items: readonly GitHubIssueSearchItem[];
  readonly nextCursor?: string;
};

export type GitHubIssueSearchRequest = {
  readonly query: string;
  readonly limit: number;
  readonly cursor?: string;
  readonly accessToken?: string;
  readonly userAgent?: string;
};

export interface GitHubClientPort {
  searchIssues(request: GitHubIssueSearchRequest): Promise<GitHubIssueSearchPage>;
}
