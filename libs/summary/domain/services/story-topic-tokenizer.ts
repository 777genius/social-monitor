import type { StoryRankingPolicy } from "../policies/story-ranking-policy";
import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";

export const storyTopicTokens = (
  item: SummaryEvidenceItem,
  policy: StoryRankingPolicy,
): readonly string[] => {
  const text = `${stripTopicSourceEnvelope(item.title)} ${
    item.bodyPreview ?? ""
  }`;
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

const stripTopicSourceEnvelope = (value: string): string =>
  value
    .replace(/^x\s+post\s+by\s+@[^:]+:\s*/iu, "")
    .replace(/^(?:ask|show)\s+hn:\s*/iu, "");

export const storyTitleIdentity = (item: SummaryEvidenceItem): string =>
  stripTopicSourceEnvelope(item.title)
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{Letter}\p{Number}+#.]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");

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
): readonly string[] =>
  tokens.filter(
    (token) => topicAnchorTokens.has(token) || isModelVersionToken(token),
  );

export const storyTopicSpecificProductTokens = (
  tokens: readonly string[],
): readonly string[] =>
  tokens.filter(
    (token) =>
      specificProductAnchorTokens.has(token) || isModelVersionToken(token),
  );

export const storyTopicEventTokens = (
  tokens: readonly string[],
): readonly string[] => tokens.filter((token) => eventAnchorTokens.has(token));

export const storyClaimFacetTokens = (
  item: SummaryEvidenceItem,
): readonly string[] => {
  const text = `${stripTopicSourceEnvelope(item.title)} ${
    item.bodyPreview ?? ""
  }`;

  return uniqueStable(
    claimFacetDefinitions.flatMap(([pattern, facet]) =>
      pattern.test(text) ? [facet] : [],
    ),
  );
};

export type StoryPrimaryClaimFacet =
  | "availability"
  | "benchmark"
  | "comparison"
  | "education"
  | "efficiency"
  | "limits"
  | "release"
  | "review"
  | "security";

export const storyPrimaryClaimFacet = (
  item: SummaryEvidenceItem,
): StoryPrimaryClaimFacet | undefined => {
  const text = `${stripTopicSourceEnvelope(item.title)} ${
    item.bodyPreview ?? ""
  }`;

  return primaryClaimFacetDefinitions.find(([pattern]) =>
    pattern.test(text),
  )?.[1];
};

const claimFacetDefinitions = [
  [/\bagents?[\s'’]+last\s+exam\b/iu, "benchmark:agents-last-exam"],
  [/\bartificial\s+analysis\b/iu, "benchmark:artificial-analysis"],
  [/\barc[\s-]?agi\b/iu, "benchmark:arc-agi"],
  [/\bchatgpt\s+work\b/iu, "feature:chatgpt-work"],
  [
    /\b(?:first\s+impressions?|hands[\s-]?on|my\s+(?:first\s+)?experience|i\s+(?:tried|tested|used))\b|\bfeel(?:s|t)?\s+(?:amazing|awesome|bad|fast|good|great|slow|terrible)\b/iu,
    "perspective:user-experience",
  ],
  [/\bcodex\s+(?:cli|command[\s-]?line)\b/iu, "feature:codex-cli"],
  [/\bclaude\s+reflect\b/iu, "feature:claude-reflect"],
  [
    /\bfable\b[\s\S]{0,64}\b(?:july\s+12(?:th)?|disclaimer|promotional?\s+period)\b|\b(?:july\s+12(?:th)?|disclaimer|promotional?\s+period)\b[\s\S]{0,64}\bfable\b/iu,
    "issue:fable-promo-window",
  ],
  [
    /\b(?:5[\s-]?hour|weekly|daily|usage)\s+limits?\b[\s\S]{0,36}\breset\b|\breset\b[\s\S]{0,36}\b(?:5[\s-]?hour|weekly|daily|usage)\s+limits?\b/iu,
    "issue:usage-limit-reset",
  ],
] as const;

const primaryClaimFacetDefinitions = [
  [
    /\b(?:benchmark|index|eval(?:uation)?|agents?[\s'’]+last\s+exam|arc[\s-]?agi|artificial\s+analysis|score[ds]?\s+\d)\b/iu,
    "benchmark",
  ],
  [
    /\b(?:comparison|side[\s-]?by[\s-]?side|versus|vs\.?|v\.)\b|\bcompared?\s+(?:against|to|with)\b/iu,
    "comparison",
  ],
  [
    /\b(?:usage\s+limits?|weekly\s+limits?|daily\s+limits?|5[\s-]?hour\s+limits?|quota|credits?)\b/iu,
    "limits",
  ],
  [
    /\b(?:course|masterclass|tutorial|workshop|curriculum|how\s+to\s+(?:use|build|master))\b/iu,
    "education",
  ],
  [
    /\b(?:token\s+efficien|cost[\s-]?efficien|price[\s-]?efficien|lower\s+cost|cheaper|cost\s+per\s+task|pareto\s+frontier)\w*/iu,
    "efficiency",
  ],
  [
    /\b(?:security|vulnerabilit|exploit|prompt\s+leak|data\s+leak|spying|surveillance)\w*/iu,
    "security",
  ],
  [
    /\b(?:availability|available|access|appear(?:s|ed|ing)?\s+in|account\s+tier|subscription\s+tier|plus\s+subscription|rolling\s+out\s+incrementally|not\s+everyone\s+will\s+see)\b/iu,
    "availability",
  ],
  [
    /\b(?:roll(?:s|ed|ing)?\s+out|rollouts?|releas(?:e|es|ed|ing)|launch(?:es|ed|ing)?|introduc(?:e|es|ed|ing))\b/iu,
    "release",
  ],
  [
    /\b(?:first\s+impressions?|hands[\s-]?on|honest\s+(?:first\s+)?impressions?|product\s+review)\b/iu,
    "review",
  ],
] as const satisfies readonly (readonly [RegExp, StoryPrimaryClaimFacet])[];

const topicAliasDefinitions = [
  [/\bchatgpt\s+work\b/iu, "chatgpt-work"],
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
  [/\bgrok\b/iu, "grok"],
  [/\b(?:xai|spacexai)\b/iu, "xai"],
  [/\bpalantir\b/iu, "palantir"],
  [/\bgithub\b/iu, "github"],
  [/\bai\s+agents?\b/iu, "ai-agent"],
  [/\bcoding\s+agents?\b/iu, "coding-agent"],
  [/\bsession\s+cache\b/iu, "session-cache"],
] as const;

const unambiguousReleaseEventPattern =
  /\b(?:roll(?:s|ed|ing)?\s+out|rollouts?|releas(?:e|es|ed|ing)|unveil(?:s|ed|ing)?|introduc(?:e|es|ed|ing))\b/iu;

const namedPublisherLaunchEventPattern =
  /\b(?:anthropic|deepmind|github|google|meta|microsoft|openai|xai)\b[\s\S]{0,48}\blaunch(?:es|ed|ing)?\b/iu;

const explicitProductLaunchEventPattern =
  /\b(?:(?:launch(?:es|ed|ing)?)\s+(?:(?:a|an|new|our|the)\s+)*(?:chatgpt\s+work|claude\s+code|(?:gpt|claude|gemini|grok|llama|fable)\s*[-\u2010-\u2015\u2212 ]?\s*\d+(?:\.\d+)*)|(?:chatgpt\s+work|claude\s+code|(?:gpt|claude|gemini|grok|llama|fable)\s*[-\u2010-\u2015\u2212 ]?\s*\d+(?:\.\d+)*)\s+(?:officially\s+)?launch(?:es|ed|ing)?)\b/iu;

const hasReleaseEvent = (value: string): boolean =>
  unambiguousReleaseEventPattern.test(value) ||
  namedPublisherLaunchEventPattern.test(value) ||
  explicitProductLaunchEventPattern.test(value);

const topicAliasTokens = (value: string): readonly string[] =>
  uniqueStable([
    ...topicAliasDefinitions.flatMap(([pattern, token]) =>
      pattern.test(value) ? [token] : [],
    ),
    ...(hasReleaseEvent(value) ? ["release-event"] : []),
    ...modelVersionAliasTokens(value),
  ]);

const modelVersionAliasTokens = (value: string): readonly string[] =>
  [...value.matchAll(modelVersionPattern)].flatMap((match) => {
    const family = match[1]?.toLocaleLowerCase("en-US");
    const version = match[2]?.toLocaleLowerCase("en-US");

    return family === undefined || version === undefined
      ? []
      : [`${family}-${version}`];
  });

const modelVersionPattern =
  /\b(gpt|claude|gemini|grok|llama|fable)\s*[-\u2010-\u2015\u2212 ]?\s*(\d+(?:\.\d+)+|\d+)\b/giu;

const normalizeTopicToken = (value: string): string | undefined => {
  const token = value
    .replace(/^[^a-z0-9+#.]+|[^a-z0-9+#.]+$/giu, "")
    .toLocaleLowerCase("en-US");

  if (token === "twitter" || token === "x.com") {
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
  "ask",
  "be",
  "been",
  "being",
  "but",
  "can",
  "could",
  "day",
  "debate",
  "did",
  "discussion",
  "do",
  "does",
  "for",
  "from",
  "global",
  "has",
  "have",
  "having",
  "high",
  "hn",
  "how",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "latest",
  "model",
  "more",
  "new",
  "news",
  "not",
  "now",
  "of",
  "often",
  "on",
  "or",
  "over",
  "post",
  "posts",
  "price",
  "pros",
  "reactions",
  "says",
  "should",
  "signal",
  "signals",
  "social",
  "source",
  "story",
  "show",
  "that",
  "the",
  "these",
  "this",
  "thread",
  "threads",
  "tooling",
  "to",
  "top",
  "user",
  "trending",
  "users",
  "was",
  "what",
  "when",
  "where",
  "who",
  "why",
  "with",
  "would",
]);

const topicAnchorTokens = new Set([
  "anthropic",
  "chatgpt",
  "chatgpt-work",
  "claude",
  "claude-code",
  "codex",
  "coding-agent",
  "cursor",
  "fable",
  "gemini",
  "github",
  "grok",
  "mcp",
  "openai",
  "palantir",
  "session-cache",
  "release-event",
  "x-twitter",
  "xai",
]);

const specificProductAnchorTokens = new Set([
  "chatgpt-work",
  "claude-code",
  "codex",
  "coding-agent",
  "cursor",
  "grok",
  "mcp",
  "session-cache",
]);

const eventAnchorTokens = new Set(["release-event"]);

const isModelVersionToken = (value: string): boolean =>
  /^(?:gpt|claude|gemini|grok|llama|fable)-\d+(?:\.\d+)*$/u.test(value);

const isDistinctTopicToken = (value: string | undefined): value is string =>
  value !== undefined &&
  value.length >= 3 &&
  !genericTopicTokens.has(value) &&
  !/^\d+$/u.test(value);

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
