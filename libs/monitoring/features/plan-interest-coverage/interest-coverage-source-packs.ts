import type {
  InterestCoverageSourcePackProviderStarter,
  InterestCoverageSourcePackView,
} from "./plan-interest-coverage.result";

export type InterestCoverageSourcePack = InterestCoverageSourcePackView & {
  readonly keywords: readonly string[];
};

export const interestCoverageSourcePacks = [
  {
    key: "ai_dev",
    displayName: "AI dev",
    description:
      "Developer and community radar for AI agents, LLM tooling, evals and RAG.",
    keywords: [
      "AI agents",
      "LLM tooling",
      "RAG",
      "evals",
      "agent observability",
    ],
    providerStarters: [
      {
        providerKey: "reddit",
        label: "Reddit AI/dev communities",
        keywords: ["AI agents", "LLM devtools", "RAG"],
        queries: [],
        subreddits: [
          "LocalLLaMA",
          "MachineLearning",
          "OpenAI",
          "LangChain",
          "AI_Agents",
        ],
        topics: [],
        languages: [],
        rssFeedUrls: [],
      },
      {
        providerKey: "hacker-news",
        label: "HN technical discussion",
        keywords: ["AI agents", "LLM tooling", "RAG", "evals"],
        queries: ["AI agents", "LLM evals", "RAG", "agent observability"],
        subreddits: [],
        topics: [],
        languages: [],
        rssFeedUrls: [],
      },
      {
        providerKey: "github-repo-radar",
        label: "GitHub repo radar",
        keywords: ["AI agents", "LLM tooling"],
        queries: [],
        subreddits: [],
        topics: ["ai", "agents", "llm", "rag", "evals"],
        languages: ["TypeScript", "Python"],
        rssFeedUrls: [],
      },
      {
        providerKey: "rss",
        label: "AI/dev RSS feeds",
        keywords: ["AI developer news"],
        queries: [],
        subreddits: [],
        topics: [],
        languages: [],
        rssFeedUrls: [
          "https://github.blog/feed/",
          "https://huggingface.co/blog/feed.xml",
        ],
      },
    ],
  },
  {
    key: "startup_radar",
    displayName: "Startup radar",
    description: "Launch, funding and founder community monitoring.",
    keywords: ["startup launch", "funding", "founder tools", "product launch"],
    providerStarters: [
      {
        providerKey: "reddit",
        label: "Reddit founder communities",
        keywords: ["startup launch", "SaaS", "founder tools"],
        queries: [],
        subreddits: ["startups", "SaaS", "Entrepreneur", "SideProject"],
        topics: [],
        languages: [],
        rssFeedUrls: [],
      },
      {
        providerKey: "hacker-news",
        label: "HN launches and Show HN",
        keywords: ["startup launch", "Show HN", "founder tools"],
        queries: ["Show HN", "startup launch", "founder tools"],
        subreddits: [],
        topics: [],
        languages: [],
        rssFeedUrls: [],
      },
      {
        providerKey: "rss",
        label: "Startup RSS feeds",
        keywords: ["startup funding"],
        queries: [],
        subreddits: [],
        topics: [],
        languages: [],
        rssFeedUrls: ["https://techcrunch.com/category/startups/feed/"],
      },
    ],
  },
  {
    key: "security",
    displayName: "Security",
    description: "Vulnerability, incident and security research radar.",
    keywords: [
      "security vulnerability",
      "incident response",
      "CVE",
      "threat intel",
    ],
    providerStarters: [
      {
        providerKey: "reddit",
        label: "Reddit security communities",
        keywords: ["CVE", "vulnerability", "incident response"],
        queries: [],
        subreddits: ["netsec", "cybersecurity", "AskNetsec", "blueteamsec"],
        topics: [],
        languages: [],
        rssFeedUrls: [],
      },
      {
        providerKey: "hacker-news",
        label: "HN security discussion",
        keywords: ["security vulnerability", "CVE", "incident response"],
        queries: ["security vulnerability", "CVE", "incident response"],
        subreddits: [],
        topics: [],
        languages: [],
        rssFeedUrls: [],
      },
      {
        providerKey: "github-repo-radar",
        label: "GitHub security tooling",
        keywords: ["security tooling", "vulnerability scanner"],
        queries: [],
        subreddits: [],
        topics: ["security", "vulnerability", "cve", "osint"],
        languages: ["Go", "Python", "Rust"],
        rssFeedUrls: [],
      },
      {
        providerKey: "rss",
        label: "Security advisories",
        keywords: ["security advisories"],
        queries: [],
        subreddits: [],
        topics: [],
        languages: [],
        rssFeedUrls: [
          "https://www.cisa.gov/cybersecurity-advisories/all.xml",
          "https://projectzero.google/feed.xml",
        ],
      },
    ],
  },
  {
    key: "crypto",
    displayName: "Crypto",
    description: "Protocol, market structure and developer community radar.",
    keywords: ["crypto protocol", "DeFi", "stablecoin", "Ethereum"],
    providerStarters: [
      {
        providerKey: "reddit",
        label: "Reddit crypto communities",
        keywords: ["DeFi", "Ethereum", "stablecoin"],
        queries: [],
        subreddits: ["CryptoCurrency", "ethfinance", "defi"],
        topics: [],
        languages: [],
        rssFeedUrls: [],
      },
      {
        providerKey: "hacker-news",
        label: "HN crypto discussion",
        keywords: ["crypto protocol", "stablecoin", "Ethereum"],
        queries: ["crypto protocol", "stablecoin", "Ethereum"],
        subreddits: [],
        topics: [],
        languages: [],
        rssFeedUrls: [],
      },
      {
        providerKey: "github-repo-radar",
        label: "GitHub protocol repos",
        keywords: ["DeFi", "Ethereum"],
        queries: [],
        subreddits: [],
        topics: ["defi", "ethereum", "web3", "crypto"],
        languages: ["Solidity", "Rust", "TypeScript"],
        rssFeedUrls: [],
      },
    ],
  },
] as const satisfies readonly InterestCoverageSourcePack[];

export const findInterestCoverageSourcePack = (
  key: string | undefined,
): InterestCoverageSourcePack | undefined => {
  const normalized = key?.trim();
  if (normalized === undefined || normalized.length === 0) {
    return undefined;
  }

  return interestCoverageSourcePacks.find((pack) => pack.key === normalized);
};

export const sourcePackProviderKeys = (
  pack: InterestCoverageSourcePack | undefined,
): readonly string[] | undefined => {
  if (pack === undefined) {
    return undefined;
  }

  return uniqueSorted(
    pack.providerStarters.map((starter) => starter.providerKey),
  );
};

export const sourcePackKeywords = (
  pack: InterestCoverageSourcePack | undefined,
): readonly string[] => {
  if (pack === undefined) {
    return [];
  }

  return uniqueSorted([
    ...pack.keywords,
    ...pack.providerStarters.flatMap((starter) => starter.keywords),
  ]);
};

export const sourcePackSubreddits = (
  pack: InterestCoverageSourcePack | undefined,
): readonly string[] =>
  uniqueSorted(
    pack?.providerStarters.flatMap((starter) => starter.subreddits) ?? [],
  );

export const sourcePackRssFeedUrls = (
  pack: InterestCoverageSourcePack | undefined,
): readonly string[] =>
  uniqueSorted(
    pack?.providerStarters.flatMap((starter) => starter.rssFeedUrls) ?? [],
  );

export const sourcePackHackerNewsQueries = (
  pack: InterestCoverageSourcePack | undefined,
): readonly string[] =>
  uniqueSorted(
    pack?.providerStarters
      .filter((starter) => starter.providerKey === "hacker-news")
      .flatMap((starter) => starter.queries) ?? [],
  );

export const sourcePackGithubTopics = (
  pack: InterestCoverageSourcePack | undefined,
): readonly string[] =>
  uniqueSorted(
    pack?.providerStarters
      .filter((starter) => starter.providerKey === "github-repo-radar")
      .flatMap((starter) => starter.topics) ?? [],
  );

export const sourcePackGithubLanguages = (
  pack: InterestCoverageSourcePack | undefined,
): readonly string[] =>
  uniqueSorted(
    pack?.providerStarters
      .filter((starter) => starter.providerKey === "github-repo-radar")
      .flatMap((starter) => starter.languages) ?? [],
  );

export const sourcePackView = (
  pack: InterestCoverageSourcePack | undefined,
): InterestCoverageSourcePackView | undefined => {
  if (pack === undefined) {
    return undefined;
  }

  return {
    key: pack.key,
    displayName: pack.displayName,
    description: pack.description,
    providerStarters: pack.providerStarters.map(normalizeStarter),
  };
};

const normalizeStarter = (
  starter: InterestCoverageSourcePackProviderStarter,
): InterestCoverageSourcePackProviderStarter => ({
  providerKey: starter.providerKey,
  label: starter.label,
  keywords: uniqueSorted(starter.keywords),
  queries: uniqueSorted(starter.queries),
  subreddits: uniqueSorted(starter.subreddits),
  topics: uniqueSorted(starter.topics),
  languages: uniqueSorted(starter.languages),
  rssFeedUrls: uniqueSorted(starter.rssFeedUrls),
});

const uniqueSorted = (values: readonly string[]): readonly string[] =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right, "en-US"),
  );
