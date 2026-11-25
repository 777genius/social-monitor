import type { SourceBindingProps } from "../../domain";
import type { SourceBindingConfig } from "../../ports";
import type {
  InterestCoveragePlanAlternativeDraft,
  InterestCoveragePlanDraft,
} from "./plan-interest-coverage.result";

export type ProviderPlanner = {
  readonly providerKey: string;
  readonly priority: number;
  readonly build: (params: BuildProviderDraftParams) => ProviderDraftPlan;
};

export type BuildProviderDraftParams = {
  readonly planningQuery: string;
  readonly hints: SourcePlannerHints;
  readonly existingSourceBinding?: SourceBindingProps;
};

export type SourcePlannerHints = {
  readonly description?: string;
  readonly subreddits: readonly string[];
  readonly invalidSubreddits: readonly string[];
  readonly rssFeedUrls: readonly string[];
  readonly hackerNewsQueries: readonly string[];
  readonly githubTopics: readonly string[];
  readonly githubLanguages: readonly string[];
};

export type ProviderDraftPlan = Omit<
  InterestCoveragePlanDraft,
  "existingSourceBindingId" | "applyTarget" | "cadenceSuggestion"
>;

export const providerPlanners: readonly ProviderPlanner[] = [
  {
    providerKey: "reddit",
    priority: 1,
    build: buildRedditDraft,
  },
  {
    providerKey: "hacker-news",
    priority: 2,
    build: buildHackerNewsDraft,
  },
  {
    providerKey: "github-repo-radar",
    priority: 3,
    build: buildGithubRepoRadarDraft,
  },
  {
    providerKey: "rss",
    priority: 4,
    build: buildRssDraft,
  },
];

export const sourcePlannerHints = (params: {
  readonly description?: string;
  readonly subreddits?: readonly string[];
  readonly rssFeedUrls?: readonly string[];
  readonly hackerNewsQueries?: readonly string[];
  readonly githubTopics?: readonly string[];
  readonly githubLanguages?: readonly string[];
}): SourcePlannerHints => {
  const subredditCandidates = params.subreddits ?? [];
  const subreddits = uniqueSorted(
    subredditCandidates.flatMap((value) => normalizeSubreddit(value) ?? []),
  );
  const invalidSubreddits = uniqueSorted(
    subredditCandidates.filter(
      (value) => normalizeSubreddit(value) === undefined,
    ),
  );

  return {
    ...(params.description === undefined
      ? {}
      : { description: params.description.trim() }),
    subreddits,
    invalidSubreddits,
    rssFeedUrls: uniqueSorted(
      (params.rssFeedUrls ?? []).map((value) => value.trim()).filter(Boolean),
    ),
    hackerNewsQueries: uniqueSorted(
      (params.hackerNewsQueries ?? [])
        .map((value) => value.trim())
        .filter(Boolean),
    ),
    githubTopics: uniqueSorted(
      (params.githubTopics ?? []).map((value) => value.trim()).filter(Boolean),
    ),
    githubLanguages: uniqueSorted(
      (params.githubLanguages ?? [])
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  };
};

function buildRedditDraft(params: BuildProviderDraftParams): ProviderDraftPlan {
  const scanPasses: SourceBindingConfig[] = [
    redditSearchPass(params.planningQuery),
    ...params.hints.subreddits.flatMap((subreddit) => [
      redditListingPass(subreddit, "new"),
      redditListingPass(subreddit, "top"),
    ]),
  ].slice(0, 10);
  const config: SourceBindingConfig = {
    mode: "search",
    query: params.planningQuery,
    maxItems: 60,
    scanPasses,
    ...(params.hints.subreddits.length === 0
      ? {}
      : { subreddits: params.hints.subreddits }),
  };
  const alreadyBound = params.existingSourceBinding !== undefined;

  return {
    providerKey: "reddit",
    displayName: "Reddit",
    priority: 1,
    status: alreadyBound ? "already_bound" : "ready",
    confidenceScore: params.hints.subreddits.length > 0 ? 8 : 6,
    targetContentUnits: ["post", "link"],
    queryModes: ["search", "listing"],
    rationale: [
      "Combines global keyword search, subreddit listing passes and comment expansion in one provider binding.",
      "Matches the current Reddit runtime contract: official OAuth API, link search, subreddit listings and post-thread comments.",
    ],
    warnings: compact([
      params.hints.subreddits.length === 0
        ? "Add 3-8 subreddit hints to improve recall and reduce noisy global Reddit search."
        : undefined,
      params.hints.invalidSubreddits.length > 0
        ? `Ignored invalid subreddit hints: ${params.hints.invalidSubreddits.join(", ")}.`
        : undefined,
      "Reddit keyword-wide comment search is not used; comments are collected from matched post threads through official OAuth endpoints.",
    ]),
    sourceBindingDraft: {
      providerKey: "reddit",
      config,
    },
    alternativeDrafts: [],
  };
}

const redditSearchPass = (query: string): SourceBindingConfig => ({
  mode: "search",
  query,
  maxItems: 30,
  minScore: 1,
  includeComments: true,
  maxCommentsPerPost: 5,
});

const redditListingPass = (
  subreddit: string,
  listing: "new" | "top",
): SourceBindingConfig => ({
  mode: "listing",
  subreddit,
  listing,
  ...(listing === "top"
    ? {
        topTime: "week",
        maxItems: 15,
        minScore: 3,
        includeComments: true,
        maxCommentsPerPost: 3,
      }
    : {
        maxItems: 20,
        includeComments: true,
        maxCommentsPerPost: 3,
      }),
});

function buildHackerNewsDraft(
  params: BuildProviderDraftParams,
): ProviderDraftPlan {
  const alreadyBound = params.existingSourceBinding !== undefined;
  const queries = uniqueSorted([
    params.planningQuery,
    ...params.hints.hackerNewsQueries,
  ]).slice(0, 4);
  const maxItemsPerPass = Math.max(10, Math.floor(60 / (queries.length * 2)));

  return {
    providerKey: "hacker-news",
    displayName: "Hacker News",
    priority: 2,
    status: alreadyBound ? "already_bound" : "ready",
    confidenceScore: 7,
    targetContentUnits: ["post", "link"],
    queryModes: ["search"],
    rationale: [
      "Uses Hacker News Algolia story and comment search for early technical discussions and launch-adjacent signals.",
      "No credentials are required, so this is a low-friction coverage source.",
    ],
    warnings: [],
    sourceBindingDraft: {
      providerKey: "hacker-news",
      config: {
        mode: "search",
        query: params.planningQuery,
        maxItems: 60,
        scanPasses: queries.flatMap((query) => [
          {
            mode: "search",
            target: "story",
            query,
            maxItems: maxItemsPerPass,
          },
          {
            mode: "search",
            target: "comment",
            query,
            maxItems: maxItemsPerPass,
          },
        ]),
      },
    },
    alternativeDrafts: [
      {
        label: "Top stories listing",
        config: {
          mode: "listing",
          listing: "top",
          query: "top",
          maxItems: 30,
        },
        rationale: [
          "Use as a broad baseline when interest keyword search is too sparse.",
        ],
      },
    ],
  };
}

function buildGithubRepoRadarDraft(
  params: BuildProviderDraftParams,
): ProviderDraftPlan {
  const alreadyBound = params.existingSourceBinding !== undefined;
  const config: SourceBindingConfig = {
    mode: "search",
    query: params.planningQuery,
    maxItems: 60,
    maxCandidates: 150,
    minStars: 5,
    windows: ["7d", "30d"],
    ...(params.hints.githubTopics.length === 0
      ? {}
      : { topics: params.hints.githubTopics }),
    ...(params.hints.githubLanguages.length === 0
      ? {}
      : { languages: params.hints.githubLanguages }),
  };

  return {
    providerKey: "github-repo-radar",
    displayName: "GitHub repo radar",
    priority: 3,
    status: alreadyBound ? "already_bound" : "ready",
    confidenceScore: params.hints.githubTopics.length > 0 ? 8 : 6,
    targetContentUnits: ["repository", "link"],
    queryModes: ["search", "topic"],
    rationale: [
      "Tracks emerging repositories by query, topic and language facets instead of relying only on social discussion.",
      "Pairs well with Reddit and Hacker News when a topic is technical or developer-led.",
    ],
    warnings: compact([
      params.hints.githubTopics.length === 0
        ? "Add GitHub topic hints to improve repo discovery precision."
        : undefined,
      "GitHub repo radar covers repositories, not issue threads or pull request discussions.",
    ]),
    sourceBindingDraft: {
      providerKey: "github-repo-radar",
      config,
    },
    alternativeDrafts: [],
  };
}

function buildRssDraft(params: BuildProviderDraftParams): ProviderDraftPlan {
  const alreadyBound = params.existingSourceBinding !== undefined;
  const [providedFeedUrl, ...alternativeFeedUrls] = params.hints.rssFeedUrls;
  const primaryFeedUrl =
    providedFeedUrl ?? googleNewsRssSearchFeed(params.planningQuery);
  const alternativeDrafts: readonly InterestCoveragePlanAlternativeDraft[] =
    alternativeFeedUrls.map((feedUrl) => ({
      label: feedUrl,
      config: rssConfig(feedUrl),
      rationale: ["Additional RSS feed candidate from the planner input."],
    }));
  const usedGeneratedFeed = providedFeedUrl === undefined;

  return {
    providerKey: "rss",
    displayName: "RSS/Atom",
    priority: 3,
    status: alreadyBound ? "already_bound" : "ready",
    confidenceScore: usedGeneratedFeed ? 5 : 8,
    targetContentUnits: ["post", "link"],
    queryModes: ["url"],
    rationale: [
      "Uses the existing SSRF-checked RSS runtime with ETag and Last-Modified cursor support.",
      ...(usedGeneratedFeed
        ? [
            "Provides a broad Google News RSS search feed when no curated feed URL was supplied.",
          ]
        : []),
    ],
    warnings: compact([
      usedGeneratedFeed
        ? "Generated RSS feed is broad news coverage; replace with official blog, changelog, docs or community feeds when available."
        : undefined,
      alternativeDrafts.length > 0
        ? "Current source-binding uniqueness allows one RSS binding per interest; extra feed URLs are returned as alternatives."
        : undefined,
    ]),
    sourceBindingDraft: {
      providerKey: "rss",
      config: rssConfig(primaryFeedUrl),
    },
    alternativeDrafts,
  };
}

const rssConfig = (feedUrl: string): SourceBindingConfig => ({
  mode: "url",
  feedUrl,
  query: feedUrl,
  maxItems: 30,
});

const googleNewsRssSearchFeed = (query: string): string => {
  const params = new URLSearchParams({
    q: query,
    hl: "en-US",
    gl: "US",
    ceid: "US:en",
  });

  return `https://news.google.com/rss/search?${params.toString()}`;
};

const normalizeSubreddit = (value: string): string | undefined => {
  const normalized = value.replace(/^r\//i, "").trim();

  return /^[A-Za-z0-9_]{2,21}$/.test(normalized) ? normalized : undefined;
};

const uniqueSorted = (values: readonly string[]): readonly string[] =>
  [...new Set(values)].sort((left, right) =>
    left.localeCompare(right, "en-US"),
  );

const compact = (values: readonly (string | undefined)[]): readonly string[] =>
  values.filter(
    (value): value is string => value !== undefined && value.length > 0,
  );
