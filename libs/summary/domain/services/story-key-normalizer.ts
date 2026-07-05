import { validateOutboundUrl } from "@social-monitor/shared-kernel";

import type { StoryRankingPolicy } from "../policies/story-ranking-policy";
import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";

export const storyKey = (
  item: SummaryEvidenceItem,
  policy: StoryRankingPolicy,
): string => {
  const canonicalUrls = canonicalUrlCandidates(item.canonicalUrl);
  const githubRepositoryKey = githubRepositoryStoryKey(item, canonicalUrls);
  if (githubRepositoryKey !== null) {
    return githubRepositoryKey;
  }

  const canonicalUrlKey = firstNonNull(canonicalUrls.map(canonicalUrlStoryKey));
  if (canonicalUrlKey !== null) {
    return canonicalUrlKey;
  }

  const storyKeyHint = trustedStoryKeyHint(item.storyKeyHint, policy);
  if (storyKeyHint !== null) {
    return storyKeyHint;
  }

  if (item.sourceItemId.trim().length > 0) {
    return `source:${item.providerKey}:${item.sourceItemId}`;
  }

  return `title:${titleFingerprint(item.title, policy)}`;
};

export const storyTopicTokens = (
  item: SummaryEvidenceItem,
  policy: StoryRankingPolicy,
): readonly string[] => {
  const text = `${item.title} ${item.bodyPreview ?? ""}`;
  const aliases = topicAliasTokens(text);
  const tokens = text
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{Letter}\p{Number}+#.\s-]+/gu, " ")
    .split(/\s+/u)
    .map(normalizeTopicToken)
    .filter((token): token is string => isDistinctTopicToken(token));

  return uniqueStable([...aliases, ...tokens]).slice(
    0,
    policy.semanticTopicMaxTokens,
  );
};

export const storyTopicSimilarity = (
  left: readonly string[],
  right: readonly string[],
): number => {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const shared = [...leftSet].filter((token) => rightSet.has(token)).length;
  const union = new Set([...leftSet, ...rightSet]).size;

  return union === 0 ? 0 : shared / union;
};

export const sharedStoryTopicTokenCount = (
  left: readonly string[],
  right: readonly string[],
): number => {
  const rightSet = new Set(right);

  return new Set(left.filter((token) => rightSet.has(token))).size;
};

export const storyTopicAnchorTokens = (
  tokens: readonly string[],
): readonly string[] => tokens.filter((token) => topicAnchorTokens.has(token));

const trustedStoryKeyHint = (
  value: string | undefined,
  policy: StoryRankingPolicy,
): string | null => {
  const storyKeyHint = value?.trim();
  if (storyKeyHint === undefined || storyKeyHint.length === 0) {
    return null;
  }

  if (
    policy.trustedStoryKeyHintPrefixes.some((prefix) =>
      storyKeyHint.startsWith(prefix),
    )
  ) {
    return storyKeyHint;
  }

  return null;
};

const githubRepositoryStoryKey = (
  item: SummaryEvidenceItem,
  canonicalUrls: readonly string[],
): string | null =>
  firstNonNull(canonicalUrls.map(githubRepositoryUrlKey)) ??
  githubRepositoryTextKey(`${item.title} ${item.bodyPreview ?? ""}`);

const canonicalUrlCandidates = (value: string): readonly string[] =>
  uniqueStable([...safeRedirectDestinationUrls(value), value]);

const safeRedirectDestinationUrls = (value: string): readonly string[] => {
  try {
    const parsed = new URL(value);
    const host = normalizeCanonicalHost(parsed.hostname);
    const candidateParams = redirectTargetParams(host, parsed.pathname);
    if (candidateParams.length === 0) {
      return [];
    }

    return candidateParams.flatMap((param) => {
      const target = parsed.searchParams.get(param)?.trim();
      if (target === undefined || target.length === 0) {
        return [];
      }

      const result = validateOutboundUrl(target, {
        label: "Redirect target URL",
        allowedProtocols: ["http:", "https:"],
      });

      return result.ok ? [result.url.toString()] : [];
    });
  } catch {
    return [];
  }
};

const redirectTargetParams = (
  host: string,
  pathname: string,
): readonly string[] => {
  const path = pathname.replace(/\/+$/u, "") || "/";
  if ((host === "google.com" || host === "google.co.uk") && path === "/url") {
    return ["url", "q"];
  }
  if (
    (host === "facebook.com" || host === "l.facebook.com") &&
    path === "/l.php"
  ) {
    return ["u"];
  }
  if (host === "linkedin.com" && path === "/redir/redirect") {
    return ["url"];
  }
  if (host === "duckduckgo.com" && path === "/l/") {
    return ["uddg"];
  }

  return [];
};

const githubRepositoryUrlKey = (value: string): string | null => {
  try {
    const parsed = new URL(value);
    const host = normalizeHost(parsed.hostname);
    if (host !== "github.com") {
      return null;
    }

    const [owner, repo] = parsed.pathname
      .split("/")
      .filter((part) => part.trim().length > 0);
    if (owner === undefined || repo === undefined) {
      return null;
    }

    const normalizedRepo = repo.replace(/\.git$/iu, "");
    if (!isLikelyRepositorySlug(owner, normalizedRepo)) {
      return null;
    }

    return `github-repo:${owner.toLocaleLowerCase("en-US")}/${normalizedRepo.toLocaleLowerCase("en-US")}`;
  } catch {
    return null;
  }
};

const githubRepositoryTextKey = (value: string): string | null => {
  const explicitUrlMatch =
    /github\.com\/([a-z0-9_.-]+)\/([a-z0-9_.-]+?)(?:\.git)?(?=$|[/?#\s).,;:])/iu.exec(
      value,
    );
  const looseSlugMatch =
    /(?:^|[\s(["'`])([a-z0-9_.-]+)\/([a-z0-9_.-]+)(?=$|[\s).,;:'"`])/iu.exec(
      value,
    );
  const match = explicitUrlMatch ?? looseSlugMatch;

  if (
    match?.[1] === undefined ||
    match[2] === undefined ||
    !isLikelyRepositorySlug(match[1], match[2])
  ) {
    return null;
  }

  return `github-repo:${match[1].toLocaleLowerCase("en-US")}/${match[2]
    .replace(/\.git$/iu, "")
    .toLocaleLowerCase("en-US")}`;
};

const canonicalUrlStoryKey = (value: string): string | null => {
  try {
    const parsed = new URL(value);
    const host = normalizeCanonicalHost(parsed.hostname);
    if (
      host === "news.ycombinator.com" &&
      parsed.pathname.replace(/\/+$/u, "") === "/item"
    ) {
      const itemId = parsed.searchParams.get("id")?.trim();
      if (itemId !== undefined && itemId.length > 0) {
        return `url:news.ycombinator.com/item/${itemId}`;
      }
    }

    parsed.hash = "";
    parsed.search = "";
    parsed.hostname = host;
    const pathname = normalizeCanonicalPath(host, parsed.pathname);

    return `url:${host}${pathname}`;
  } catch {
    return null;
  }
};

const normalizeHost = (value: string): string =>
  value.toLocaleLowerCase("en-US").replace(/^www\./u, "");

const normalizeCanonicalHost = (value: string): string => {
  const host = normalizeHost(value)
    .replace(/^m\./u, "")
    .replace(/^old\./u, "")
    .replace(/^mobile\./u, "");
  if (host === "twitter.com") {
    return "x.com";
  }

  return host;
};

const normalizeCanonicalPath = (host: string, value: string): string => {
  const normalized = value.replace(/\/{2,}/gu, "/").replace(/\/+$/u, "");
  const lowerCasePathHosts = new Set([
    "github.com",
    "reddit.com",
    "x.com",
    "news.ycombinator.com",
  ]);
  const path = lowerCasePathHosts.has(host)
    ? normalized.toLocaleLowerCase("en-US")
    : normalized;

  return path;
};

const repositorySlugStopWords = new Set([
  "comments",
  "item",
  "r",
  "status",
  "u",
  "user",
  "users",
]);

const isLikelyRepositorySlug = (owner: string, repo: string): boolean => {
  const normalizedOwner = owner.toLocaleLowerCase("en-US");
  const normalizedRepo = repo
    .replace(/\.git$/iu, "")
    .toLocaleLowerCase("en-US");

  return (
    normalizedOwner.length > 1 &&
    normalizedRepo.length > 1 &&
    !repositorySlugStopWords.has(normalizedOwner) &&
    !repositorySlugStopWords.has(normalizedRepo)
  );
};

const titleFingerprint = (value: string, policy: StoryRankingPolicy): string =>
  value
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{Letter}\p{Number}\s]+/gu, " ")
    .split(/\s+/u)
    .filter((token) => token.length > 2)
    .slice(0, policy.titleFingerprintMaxTokens)
    .join("-") || "untitled";

const topicAliasDefinitions = [
  [/\bclaude\s+code\b/iu, "claude-code"],
  [/\bclaude\b/iu, "claude"],
  [/\bfable\b/iu, "fable"],
  [/\bmcp\b/iu, "mcp"],
  [/\bmodel\s+context\s+protocol\b/iu, "mcp"],
  [/\bopenai\b/iu, "openai"],
  [/\bchatgpt\b/iu, "chatgpt"],
  [/\bcodex\b/iu, "codex"],
  [/\bcursor\b/iu, "cursor"],
  [/\banthropic\b/iu, "anthropic"],
  [/\bgemini\b/iu, "gemini"],
  [/\bpalantir\b/iu, "palantir"],
  [/\bgithub\b/iu, "github"],
  [/\bai\s+agents?\b/iu, "ai-agent"],
  [/\bcoding\s+agents?\b/iu, "coding-agent"],
  [/\bsession\s+cache\b/iu, "session-cache"],
] as const;

const topicAliasTokens = (value: string): readonly string[] =>
  uniqueStable(
    topicAliasDefinitions.flatMap(([pattern, token]) =>
      pattern.test(value) ? [token] : [],
    ),
  );

const normalizeTopicToken = (value: string): string | undefined => {
  const token = value
    .replace(/^[^a-z0-9+#.]+|[^a-z0-9+#.]+$/giu, "")
    .toLocaleLowerCase("en-US");

  if (token === "twitter") {
    return "x-twitter";
  }
  if (token === "x.com") {
    return "x-twitter";
  }
  if (token === "agents") {
    return "agent";
  }
  if (token === "models") {
    return "model";
  }

  return token.length === 0 ? undefined : token;
};

const genericTopicTokens = new Set([
  "about",
  "after",
  "again",
  "against",
  "also",
  "amid",
  "and",
  "are",
  "but",
  "can",
  "day",
  "debate",
  "discussion",
  "for",
  "from",
  "has",
  "have",
  "high",
  "into",
  "latest",
  "model",
  "more",
  "new",
  "news",
  "now",
  "often",
  "over",
  "post",
  "posts",
  "reactions",
  "says",
  "signal",
  "signals",
  "social",
  "source",
  "story",
  "thread",
  "threads",
  "tooling",
  "top",
  "trending",
  "users",
  "with",
]);

const topicAnchorTokens = new Set([
  "anthropic",
  "chatgpt",
  "claude",
  "claude-code",
  "codex",
  "coding-agent",
  "cursor",
  "fable",
  "gemini",
  "github",
  "mcp",
  "openai",
  "palantir",
  "session-cache",
  "x-twitter",
]);

const isDistinctTopicToken = (value: string | undefined): value is string =>
  value !== undefined &&
  value.length >= 3 &&
  !genericTopicTokens.has(value) &&
  !/^\d+$/u.test(value);

const firstNonNull = <TValue>(
  values: readonly (TValue | null)[],
): TValue | null => {
  for (const value of values) {
    if (value !== null) {
      return value;
    }
  }

  return null;
};

const uniqueStable = (values: readonly string[]): readonly string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }

  return result;
};
