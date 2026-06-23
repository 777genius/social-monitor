import type {
  GitHubClientPort,
  GitHubIssueSearchItem,
  GitHubIssueSearchPage,
  GitHubIssueSearchRequest,
  GitHubRepositoryDetails,
  GitHubRepositoryDetailsClientPort,
  GitHubRepositoryDetailsRequest,
} from './github-client.port';

type GitHubSearchIssueDto = {
  readonly id?: number;
  readonly node_id?: string;
  readonly html_url?: string;
  readonly title?: string;
  readonly body?: string | null;
  readonly user?: {
    readonly login?: string;
  } | null;
  readonly created_at?: string;
  readonly updated_at?: string;
  readonly state?: string;
  readonly pull_request?: unknown;
};

type GitHubSearchResponseDto = {
  readonly items?: readonly GitHubSearchIssueDto[];
};

type GitHubRepositoryDto = {
  readonly full_name?: string;
  readonly html_url?: string;
  readonly description?: string | null;
  readonly language?: string | null;
  readonly topics?: readonly string[];
  readonly license?: {
    readonly spdx_id?: string | null;
  } | null;
  readonly stargazers_count?: number;
  readonly fork?: boolean;
  readonly archived?: boolean;
  readonly pushed_at?: string | null;
  readonly updated_at?: string | null;
};

const githubApiBaseUrl = 'https://api.github.com';
const defaultUserAgent = 'social-monitor-mvp/0.1';

export class HttpGitHubClient implements GitHubClientPort, GitHubRepositoryDetailsClientPort {
  constructor(private readonly timeoutMs = 10_000) {}

  async searchIssues(request: GitHubIssueSearchRequest): Promise<GitHubIssueSearchPage> {
    const url = new URL(`${githubApiBaseUrl}/search/issues`);
    url.searchParams.set('q', request.query);
    url.searchParams.set('sort', 'updated');
    url.searchParams.set('order', 'desc');
    url.searchParams.set('per_page', String(normalizeLimit(request.limit)));
    url.searchParams.set('page', String(readPageCursor(request.cursor)));

    const response = await fetch(url, {
      headers: this.headers({
        accessToken: request.accessToken,
        userAgent: request.userAgent,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status}`);
    }

    const body = await response.json() as GitHubSearchResponseDto;

    return {
      items: (body.items ?? []).map(normalizeIssue),
      nextCursor: parseNextPageCursor(response.headers.get('link')),
    };
  }

  async getRepository(request: GitHubRepositoryDetailsRequest): Promise<GitHubRepositoryDetails | null> {
    const fullName = normalizeRepositoryFullName(request.fullName);
    if (fullName === undefined) {
      throw new Error('GitHub repository full name must be owner/repo');
    }

    const url = new URL(`${githubApiBaseUrl}/repos/${fullName}`);
    const response = await fetch(url, {
      headers: this.headers({
        accessToken: request.accessToken,
        userAgent: request.userAgent,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status}`);
    }

    const body = await response.json() as GitHubRepositoryDto;

    return normalizeRepository(body);
  }

  private headers(request: {
    readonly accessToken?: string;
    readonly userAgent?: string;
  }): Record<string, string> {
    const headers: Record<string, string> = {
      accept: 'application/vnd.github+json',
      'user-agent': request.userAgent ?? defaultUserAgent,
      'x-github-api-version': '2022-11-28',
    };

    const accessToken = normalizeOptionalString(request.accessToken);
    if (accessToken !== undefined) {
      headers.authorization = `Bearer ${accessToken}`;
    }

    return headers;
  }
}

const normalizeIssue = (issue: GitHubSearchIssueDto): GitHubIssueSearchItem => ({
  id: issue.id,
  nodeId: issue.node_id,
  htmlUrl: issue.html_url,
  title: issue.title,
  body: issue.body ?? undefined,
  userLogin: issue.user?.login,
  createdAt: issue.created_at,
  updatedAt: issue.updated_at,
  state: issue.state,
  isPullRequest: issue.pull_request !== undefined,
});

const normalizeRepository = (repository: GitHubRepositoryDto): GitHubRepositoryDetails => ({
  fullName: repository.full_name ?? '',
  htmlUrl: repository.html_url ?? '',
  description: repository.description ?? undefined,
  language: repository.language ?? undefined,
  topics: repository.topics ?? [],
  licenseSpdxId: repository.license?.spdx_id ?? undefined,
  stargazersCount: typeof repository.stargazers_count === 'number' ? repository.stargazers_count : 0,
  fork: repository.fork === true,
  archived: repository.archived === true,
  pushedAt: repository.pushed_at ?? undefined,
  updatedAt: repository.updated_at ?? undefined,
});

const normalizeRepositoryFullName = (value: string): string | undefined => {
  const trimmed = value.trim();

  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(trimmed) ? trimmed : undefined;
};

const normalizeLimit = (limit: number): number => {
  if (!Number.isInteger(limit) || limit < 1) {
    return 1;
  }

  return Math.min(limit, 100);
};

const readPageCursor = (cursor: string | undefined): number => {
  if (cursor === undefined) {
    return 1;
  }

  const parsed = Number(cursor);

  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
};

const normalizeOptionalString = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
};

const parseNextPageCursor = (linkHeader: string | null): string | undefined => {
  if (linkHeader === null) {
    return undefined;
  }

  for (const segment of linkHeader.split(',')) {
    if (!segment.includes('rel="next"')) {
      continue;
    }

    const match = segment.match(/<([^>]+)>/);
    if (match?.[1] === undefined) {
      continue;
    }

    const page = new URL(match[1]).searchParams.get('page');

    if (page !== null && /^\d+$/.test(page)) {
      return page;
    }
  }

  return undefined;
};
