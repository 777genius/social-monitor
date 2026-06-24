import { HttpGitHubClient } from './http-github-client';

describe('HttpGitHubClient', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('uses a trimmed bearer token without exposing it in errors or response data', async () => {
    const fetchMock = jest.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.headers).toEqual(expect.objectContaining({
        authorization: 'Bearer token-value',
      }));

      return new Response(JSON.stringify({
        items: [{
          id: 1,
          node_id: 'node-1',
          html_url: 'https://github.com/acme/project/issues/1',
          title: 'Issue title',
          body: 'Issue body',
          user: { login: 'octocat' },
          created_at: '2026-06-21T00:00:00.000Z',
          updated_at: '2026-06-21T01:00:00.000Z',
          state: 'open',
        }],
      }), {
        status: 200,
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(new HttpGitHubClient().searchIssues({
      query: 'repo:acme/project is:issue',
      limit: 1,
      accessToken: '  token-value  ',
    })).resolves.toMatchObject({
      items: [{
        htmlUrl: 'https://github.com/acme/project/issues/1',
        title: 'Issue title',
      }],
    });
  });

  it('omits authorization for anonymous or blank token requests', async () => {
    const fetchMock = jest.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.headers).not.toEqual(expect.objectContaining({
        authorization: expect.any(String),
      }));

      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await new HttpGitHubClient().searchIssues({
      query: 'repo:acme/project is:issue',
      limit: 1,
      accessToken: '   ',
    });
  });

  it('maps repository stars and forks from GitHub REST repository JSON', async () => {
    const fetchMock = jest.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.github.com/repos/openai/codex');
      expect(init?.headers).toEqual(expect.objectContaining({
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
      }));

      return new Response(JSON.stringify({
        full_name: 'openai/codex',
        html_url: 'https://github.com/openai/codex',
        description: 'Lightweight coding agent',
        language: 'Rust',
        topics: ['agents', 'developer-tools'],
        license: {
          spdx_id: 'Apache-2.0',
        },
        stargazers_count: 93_263,
        forks_count: 13_787,
        fork: false,
        archived: false,
        pushed_at: '2026-06-24T08:00:00Z',
        updated_at: '2026-06-24T09:00:00Z',
      }), {
        status: 200,
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(new HttpGitHubClient().getRepository({
      fullName: 'openai/codex',
    })).resolves.toEqual({
      fullName: 'openai/codex',
      htmlUrl: 'https://github.com/openai/codex',
      description: 'Lightweight coding agent',
      language: 'Rust',
      topics: ['agents', 'developer-tools'],
      licenseSpdxId: 'Apache-2.0',
      stargazersCount: 93_263,
      forksCount: 13_787,
      fork: false,
      archived: false,
      pushedAt: '2026-06-24T08:00:00Z',
      updatedAt: '2026-06-24T09:00:00Z',
    });
  });
});
