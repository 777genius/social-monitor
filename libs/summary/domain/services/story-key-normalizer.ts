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
): string | null => {
  const canonicalKey = singleUnambiguousKey(
    canonicalUrls.map(githubRepositoryUrlKey),
  );
  if (canonicalKey !== null) {
    return canonicalKey;
  }

  const fields = [item.title, item.bodyPreview ?? ""];
  const explicitTextKeys = fields.flatMap(githubRepositoryExplicitTextKeys);
  if (explicitTextKeys.length > 0) {
    return singleUnambiguousKey(explicitTextKeys);
  }

  return singleUnambiguousKey(
    fields.flatMap(githubRepositoryBareTextKeys),
  );
};

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

const githubRepositoryExplicitTextKeys = (value: string): readonly string[] =>
  uniqueStable(
    [...value.matchAll(explicitGithubRepositoryUrlPattern)].flatMap((match) => {
      const key = githubRepositoryMatchKey(match);
      return key === null ? [] : [key];
    }),
  );

const explicitGithubRepositoryUrlPattern =
  /github\.com\/([a-z0-9_.-]+)\/([a-z0-9_.-]+?)(?:\.git)?(?=$|[/?#\s).,;:])/giu;

const githubRepositoryBareTextKeys = (value: string): readonly string[] =>
  uniqueStable(
    [...value.matchAll(bareRepositorySlugPattern)].flatMap((match) => {
      if (
        match[1] === undefined ||
        match[2] === undefined ||
        match.index === undefined ||
        !hasExplicitRepositoryContext(value, match.index)
      ) {
        return [];
      }
      const key = githubRepositoryMatchKey(match);
      return key === null ? [] : [key];
    }),
  );

const bareRepositorySlugPattern =
  /(?<![a-z0-9_./-])([a-z0-9_.-]+)\/([a-z0-9_.-]+)(?![a-z0-9_./-])/giu;

const repositoryContextBeforePattern =
  /(?:^|[\s([{"'`])(?:github(?:\s+(?:repos?|repositor(?:y|ies)|project))?|repos?|repositor(?:y|ies))\s*(?:(?:named|called)\s+|[:=-]\s*)?$/iu;

const hasExplicitRepositoryContext = (
  value: string,
  matchIndex: number,
): boolean => {
  const contextStart = Math.max(0, matchIndex - repositoryContextRadius);
  const before = value.slice(contextStart, matchIndex);

  return repositoryContextBeforePattern.test(before);
};

const repositoryContextRadius = 64;

const githubRepositoryMatchKey = (
  match: RegExpExecArray | RegExpMatchArray | null,
): string | null => {
  const repository = normalizedRepositoryTextSlug(match?.[2]);
  if (
    match?.[1] === undefined ||
    repository === undefined ||
    !isLikelyRepositorySlug(match[1], repository)
  ) {
    return null;
  }

  return `github-repo:${match[1].toLocaleLowerCase("en-US")}/${repository.toLocaleLowerCase("en-US")}`;
};

const normalizedRepositoryTextSlug = (
  value: string | undefined,
): string | undefined => {
  const normalized = value?.replace(/\.git$/iu, "").replace(/\.+$/u, "");
  return normalized === undefined || normalized.length === 0
    ? undefined
    : normalized;
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

const singleUnambiguousKey = (
  values: readonly (string | null)[],
): string | null => {
  const keys = uniqueStable(
    values.filter((value): value is string => value !== null),
  );

  return keys.length === 1 ? keys[0]! : null;
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
