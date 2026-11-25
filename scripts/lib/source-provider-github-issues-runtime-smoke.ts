import { HttpGitHubClient } from "../../libs/ingestion/adapters/source/github/http-github-client";
import { GitHubSourceProvider } from "../../libs/ingestion/adapters/source/github/github-source.provider";
import type { ProviderFailureKind, SourceProviderPort } from "../../libs/ingestion/ports";
import { jsonResponse, readHeader } from "./source-provider-runtime-http-fixtures";

type GitHubIssuesRuntimeSmokeDependencies = {
  readonly withMockedFetch: <TResult>(
    fetchMock: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
    run: () => Promise<TResult>,
  ) => Promise<TResult>;
  readonly assertFailure: (
    provider: SourceProviderPort,
    message: string,
    expectedKind: ProviderFailureKind,
    expectedRetryable: boolean,
  ) => void;
  readonly assert: (condition: unknown, message: string) => asserts condition;
};

export async function verifyGitHubIssuesRuntimeModes({ withMockedFetch, assertFailure, assert: runtimeAssert }: GitHubIssuesRuntimeSmokeDependencies): Promise<void> {
  const assert: GitHubIssuesRuntimeSmokeDependencies["assert"] = runtimeAssert;
  const fetchedUrls: string[] = [];
  const readOnlyToken = ["github", "read", "token"].join("-");
  await withMockedFetch(
    async (input, init) => {
      fetchedUrls.push(String(input));
      const url = new URL(String(input));
      assert(
        url.hostname === "api.github.com",
        "GitHub issues runtime must use the GitHub REST API host",
      );
      assert(
        url.pathname === "/search/issues",
        "GitHub issues runtime must use search/issues endpoint",
      );
      assert(
        url.searchParams.get("sort") === "updated",
        "GitHub issues runtime must request updated sorting",
      );
      assert(
        url.searchParams.get("order") === "desc",
        "GitHub issues runtime must request descending order",
      );
      assert(
        readHeader(init?.headers, "accept") === "application/vnd.github+json",
        "GitHub issues runtime must request GitHub JSON",
      );
      assert(
        readHeader(init?.headers, "x-github-api-version") === "2022-11-28",
        "GitHub issues runtime must pin GitHub REST API version",
      );
      const userAgent = readHeader(init?.headers, "user-agent");
      assert(
        userAgent !== undefined && userAgent.length > 0,
        "GitHub issues runtime must set User-Agent",
      );

      const auth = readHeader(init?.headers, "authorization");
      if (fetchedUrls.length === 1) {
        assert(
          auth === undefined,
          "GitHub issues anonymous mode must omit Authorization",
        );
      } else {
        assert(
          auth === ["Bearer", readOnlyToken].join(" "),
          "GitHub issues token mode must trim the read credential and apply the bearer auth scheme",
        );
      }

      return jsonResponse(
        {
          items: [
            {
              id: fetchedUrls.length,
              node_id: `github-node-${fetchedUrls.length}`,
              html_url: `https://github.com/acme/project/issues/${fetchedUrls.length}`,
              title: "GitHub runtime contract issue",
              body: "Issue body",
              user: { login: "octocat" },
              created_at: "2026-06-22T10:00:00.000Z",
              updated_at: "2026-06-22T10:01:00.000Z",
              state: "open",
            },
          ],
        },
        {
          link: '<https://api.github.com/search/issues?q=x&page=2>; rel="next"',
        },
      );
    },
    async () => {
      const client = new HttpGitHubClient();
      const anonymous = await client.searchIssues({
        query: "repo:acme/project is:issue",
        limit: 1,
        accessToken: "   ",
      });
      const token = await client.searchIssues({
        query: "repo:acme/project is:issue",
        limit: 1,
        accessToken: ` ${readOnlyToken} `,
      });
      assert(
        anonymous.nextCursor === "2",
        "GitHub issues runtime must parse next page cursor",
      );
      assert(
        token.items[0]?.htmlUrl === "https://github.com/acme/project/issues/2",
        "GitHub issues token mode must return normalized items",
      );
    },
  );

  await withMockedFetch(
    async () =>
      new Response(
        JSON.stringify({ message: "rate limited", token: readOnlyToken }),
        { status: 403 },
      ),
    async () => {
      try {
        await new HttpGitHubClient().searchIssues({
          query: "repo:acme/project is:issue",
          limit: 1,
          accessToken: readOnlyToken,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        assert(
          !message.includes(readOnlyToken),
          "GitHub issues HTTP errors must not leak token values",
        );
        return;
      }

      throw new Error("GitHub issues client must fail closed on HTTP errors");
    },
  );

  const sourceProvider = new GitHubSourceProvider(new HttpGitHubClient());
  assertFailure(
    sourceProvider,
    "GitHub API returned 401 bad credentials",
    "auth_failed",
    false,
  );
  assertFailure(
    sourceProvider,
    "GitHub API returned 403 rate limit exceeded",
    "rate_limited",
    true,
  );
  assertFailure(
    sourceProvider,
    "GitHub API returned 429",
    "rate_limited",
    true,
  );
  assertFailure(sourceProvider, "GitHub API returned 503", "unavailable", true);
}
