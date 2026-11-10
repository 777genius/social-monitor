import { BigQueryGitHubRepoRadarClient } from "../../libs/ingestion/adapters/source/github-repo-radar/bigquery-github-repo-radar-client";
import { GitHubRepoRadarSourceProvider } from "../../libs/ingestion/adapters/source/github-repo-radar/github-repo-radar-source.provider";
import { GitHubRepositoryLiveVerifierAdapter } from "../../libs/ingestion/adapters/source/github-repo-radar/github-repository-live-verifier.adapter";
import { HttpGitHubClient } from "../../libs/ingestion/adapters/source/github/http-github-client";
import { GITHUB_REPO_RADAR_PROVIDER_KEY, parseGitHubRepositoryTrendMetadata } from "../../libs/ingestion/domain";
import type { ProviderFailureKind, SourceProviderPort, SourceProviderScanContext } from "../../libs/ingestion/ports";
import { jsonResponse, readHeader } from "./source-provider-runtime-http-fixtures";

type RepoRadarRuntimeSmokeDependencies = {
  readonly withMockedFetch: <TResult>(
    fetchMock: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
    run: () => Promise<TResult>,
  ) => Promise<TResult>;
  readonly contextFor: (providerKey: string, config?: SourceProviderScanContext["config"]) => SourceProviderScanContext;
  readonly assertFailure: (provider: SourceProviderPort, message: string, expectedKind: ProviderFailureKind, expectedRetryable: boolean) => void;
  readonly assert: (condition: unknown, message: string) => asserts condition;
};

export async function verifyGitHubRepoRadarRuntimeModes({ withMockedFetch, assertFailure, contextFor, assert }: RepoRadarRuntimeSmokeDependencies): Promise<void> {
  let observedBigQueryJob = false;
  let observedGitHubRepositoryFetch = false;
  const readOnlyToken = ["github", "repo-radar", "read", "token"].join("-");
  const bigQueryClient = {
    async createQueryJob(options: {
      readonly query?: unknown;
      readonly location?: unknown;
      readonly maximumBytesBilled?: unknown;
      readonly jobTimeoutMs?: unknown;
      readonly params?: Readonly<Record<string, unknown>>;
    }) {
      observedBigQueryJob = true;
      assert(
        typeof options.query === "string",
        "GitHub repo radar must submit a BigQuery SQL string",
      );
      assert(
        options.query.includes("githubarchive.day.20*"),
        "GitHub repo radar must query only GH Archive numeric day tables",
      );
      assert(
        options.query.includes("type = 'WatchEvent'"),
        "GitHub repo radar must aggregate WatchEvent records",
      );
      assert(
        options.location === "US",
        "GitHub repo radar BigQuery location must be explicit",
      );
      assert(
        options.maximumBytesBilled === "123456789",
        "GitHub repo radar must bound BigQuery bytes billed",
      );
      assert(
        options.jobTimeoutMs === 456,
        "GitHub repo radar must pass a BigQuery job timeout",
      );
      assert(
        options.params?.query === "",
        "topic/language searches must not be incorrectly filtered by repository name",
      );
      assert(
        options.params?.limit === 3,
        "GitHub repo radar must bound BigQuery candidate count",
      );
      assert(
        options.params?.startTableSuffix === "260325",
        "GitHub repo radar must query the largest configured trend window start table suffix",
      );
      assert(
        options.params?.endTableSuffix === "260623",
        "GitHub repo radar must query the checked-at table suffix",
      );
      return [
        {
          async getQueryResults(
            getOptions: { readonly timeoutMs?: unknown } = {},
          ) {
            assert(
              getOptions.timeoutMs === 123,
              "GitHub repo radar must bound BigQuery result wait time",
            );
            return [
              [
                {
                  full_name: "openai/codex",
                  stars_24h: "210",
                  stars_48h: "360",
                  stars_7d: "0",
                  stars_30d: "0",
                  stars_90d: "0",
                },
              ],
            ];
          },
        },
      ];
    },
  };

  await withMockedFetch(
    async (input, init) => {
      observedGitHubRepositoryFetch = true;
      const url = new URL(String(input));
      assert(
        url.hostname === "api.github.com",
        "GitHub repo radar live verifier must use GitHub REST API host",
      );
      assert(
        url.pathname === "/repos/openai/codex",
        "GitHub repo radar live verifier must fetch repository details",
      );
      assert(
        readHeader(init?.headers, "accept") === "application/vnd.github+json",
        "GitHub repo radar must request GitHub JSON",
      );
      assert(
        readHeader(init?.headers, "x-github-api-version") === "2022-11-28",
        "GitHub repo radar must pin GitHub REST API version",
      );
      assert(
        readHeader(init?.headers, "authorization") ===
          `Bearer ${readOnlyToken}`,
        "GitHub repo radar must use read-only token when supplied",
      );
      assert(
        readHeader(init?.headers, "user-agent") ===
          "social-monitor-runtime-contract",
        "GitHub repo radar must pass configured User-Agent",
      );
      return jsonResponse({
        full_name: "openai/codex",
        html_url: "https://github.com/openai/codex",
        description: "AI coding agent CLI and developer workflow tooling.",
        language: "TypeScript",
        topics: ["ai", "agents", "developer-tools"],
        license: { spdx_id: "Apache-2.0" },
        stargazers_count: 54000,
        fork: false,
        archived: false,
        pushed_at: "2026-06-23T08:00:00.000Z",
        updated_at: "2026-06-23T08:30:00.000Z",
      });
    },
    async () => {
      const provider = new GitHubRepoRadarSourceProvider(
        new BigQueryGitHubRepoRadarClient({
          client: bigQueryClient as never,
          maximumBytesBilled: "123456789",
          timeoutMs: 123,
          jobTimeoutMs: 456,
        }),
        new GitHubRepositoryLiveVerifierAdapter(new HttpGitHubClient()),
        { now: () => new Date("2026-06-23T12:00:00.000Z") },
      );
      const context = contextFor(GITHUB_REPO_RADAR_PROVIDER_KEY, {
        topics: ["agents"],
        languages: ["TypeScript"],
        minStars: 100,
        maxItems: 1,
        maxCandidates: 3,
        accessToken: ` ${readOnlyToken} `,
        userAgent: "social-monitor-runtime-contract",
      });
      const plan = provider.planScan(
        { mode: "search", query: "agents" },
        context,
      );
      const result = await provider.scan(plan, context);
      const metadata = parseGitHubRepositoryTrendMetadata(
        result.items[0]?.metadata,
      );
      assert(
        result.items.length === 1,
        "GitHub repo radar runtime must emit a verified repository trend item",
      );
      assert(
        metadata !== null,
        "GitHub repo radar runtime must emit repository trend metadata",
      );
      assert(
        metadata.repository.fullName === "openai/codex",
        "GitHub repo radar metadata must keep repository full name",
      );
      assert(
        metadata.trend.stars48h === 360,
        "GitHub repo radar metadata must keep 48h star delta",
      );
      assert(
        metadata.trend.source === "gh_archive_bigquery_plus_github_live",
        "GitHub repo radar metadata must identify runtime source",
      );
    },
  );

  assert(
    observedBigQueryJob,
    "GitHub repo radar runtime contract must observe BigQuery query creation",
  );
  assert(
    observedGitHubRepositoryFetch,
    "GitHub repo radar runtime contract must observe GitHub repository fetch",
  );

  const sourceProvider = new GitHubRepoRadarSourceProvider(
    new BigQueryGitHubRepoRadarClient({ client: bigQueryClient as never }),
    new GitHubRepositoryLiveVerifierAdapter(new HttpGitHubClient()),
    { now: () => new Date("2026-06-23T12:00:00.000Z") },
  );
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
    "BigQuery quota exceeded",
    "rate_limited",
    true,
  );
  assertFailure(sourceProvider, "GitHub API returned 503", "unavailable", true);
}
