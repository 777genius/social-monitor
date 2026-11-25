export type SourceItemRankingMode = "relevance" | "hybrid" | "engagement";

export type RankableSourceItem = {
  readonly title: string;
  readonly body: string;
  readonly authorHandle?: string;
  readonly publishedAt: Date;
  readonly metadata?: unknown;
};

export type SourceItemRankingPlan = {
  readonly mode: SourceItemRankingMode;
  readonly queries: readonly string[];
  readonly generatedAt?: Date;
};

const defaultRankingMode: SourceItemRankingMode = "relevance";

export const createSourceItemRankingPlan = (params: {
  readonly mode?: unknown;
  readonly queries: readonly string[];
  readonly generatedAt?: Date;
}): SourceItemRankingPlan => ({
  mode: readRankingMode(params.mode),
  queries: compactUnique(params.queries),
  generatedAt: params.generatedAt,
});

export type SourceItemRankingReasonCode =
  | "query_token_match"
  | "exact_phrase_match"
  | "trusted_handle_match"
  | "strong_engagement_signal"
  | "fresh_source_item";

export type SourceItemRankingBreakdown = {
  readonly mode: SourceItemRankingMode;
  readonly totalScore: number;
  readonly relevanceScore: number;
  readonly tokenMatchRatio: number;
  readonly exactPhraseScore: number;
  readonly authorityScore: number;
  readonly engagementRaw: number;
  readonly engagementCapped: number;
  readonly freshnessScore: number;
  readonly reasonCodes: readonly SourceItemRankingReasonCode[];
};

export const rankSourceItems = <TItem extends RankableSourceItem>(
  items: readonly TItem[],
  plan: SourceItemRankingPlan,
): readonly TItem[] =>
  [...items].sort((left, right) => {
    const scoreDiff =
      sourceItemRankingScore(right, plan) - sourceItemRankingScore(left, plan);

    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    return right.publishedAt.getTime() - left.publishedAt.getTime();
  });

export const sourceItemRankingScore = (
  item: RankableSourceItem,
  plan: SourceItemRankingPlan,
): number => sourceItemRankingBreakdown(item, plan).totalScore;

export const sourceItemRankingBreakdown = (
  item: RankableSourceItem,
  plan: SourceItemRankingPlan,
): SourceItemRankingBreakdown => {
  const relevance = sourceItemRelevanceBreakdown(item, plan.queries);
  const engagementRaw = sourceItemEngagementScore(item);
  const engagementCapped = cappedEngagementScore(engagementRaw);
  const authorityScore = sourceItemAuthorityScore(item, plan.queries);
  const freshnessScore = sourceItemFreshnessScore(item, plan.generatedAt);
  const reasonCodes = compactUnique([
    relevance.tokenMatchRatio > 0 ? "query_token_match" : undefined,
    relevance.exactPhraseScore > 0 ? "exact_phrase_match" : undefined,
    authorityScore > 0 ? "trusted_handle_match" : undefined,
    engagementCapped >= 2 ? "strong_engagement_signal" : undefined,
    freshnessScore >= 0.2 ? "fresh_source_item" : undefined,
  ]) as readonly SourceItemRankingReasonCode[];
  const relevanceScore = relevance.score + authorityScore;
  let totalScore: number;

  if (plan.mode === "engagement") {
    totalScore = engagementRaw;
  } else if (plan.mode === "hybrid") {
    totalScore = relevanceScore * 100 + engagementCapped * 10 + freshnessScore;
  } else {
    totalScore = relevanceScore * 1_000 + engagementCapped + freshnessScore;
  }

  return {
    mode: plan.mode,
    totalScore: roundScore(totalScore),
    relevanceScore: roundScore(relevanceScore),
    tokenMatchRatio: roundScore(relevance.tokenMatchRatio),
    exactPhraseScore: roundScore(relevance.exactPhraseScore),
    authorityScore: roundScore(authorityScore),
    engagementRaw: roundScore(engagementRaw),
    engagementCapped: roundScore(engagementCapped),
    freshnessScore: roundScore(freshnessScore),
    reasonCodes,
  };
};

export const sourceItemRelevanceScore = (
  item: RankableSourceItem,
  queries: readonly string[],
): number => sourceItemRelevanceBreakdown(item, queries).score;

const sourceItemRelevanceBreakdown = (
  item: RankableSourceItem,
  queries: readonly string[],
): {
  readonly score: number;
  readonly tokenMatchRatio: number;
  readonly exactPhraseScore: number;
} => {
  const queryTokens = tokenizeQuery(queries.join(" "));

  if (queryTokens.length === 0) {
    return { score: 0, tokenMatchRatio: 0, exactPhraseScore: 0 };
  }

  const rawItemText = `${item.title} ${item.body}`;
  const itemText = normalizeText(rawItemText);
  const itemTokens = new Set(tokenizePlainText(rawItemText));
  const matchedTokens = queryTokens.filter((token) => itemTokens.has(token));
  const tokenScore =
    matchedTokens.length / Math.min(Math.max(queryTokens.length, 1), 12);
  const phraseScore = Math.min(
    quotedPhrases(queries.join(" ")).filter((phrase) =>
      itemText.includes(normalizeText(phrase)),
    ).length * 0.2,
    0.4,
  );

  return {
    score: tokenScore + phraseScore,
    tokenMatchRatio: tokenScore,
    exactPhraseScore: phraseScore,
  };
};

export const sourceItemEngagementScore = (
  item: RankableSourceItem,
): number => {
  const metadata = readRecord(item.metadata);
  const metrics = readRecord(metadata?.metrics);
  const publicMetrics = readRecord(metadata?.publicMetrics);

  return (
    readMetric(metadata?.trendScore) +
    readMetric(metadata?.score) +
    readMetric(metadata?.likes, publicMetrics?.like_count, metrics?.likes) +
    readMetric(
      metadata?.retweets,
      metadata?.reposts,
      publicMetrics?.retweet_count,
      metrics?.retweets,
    ) *
      2 +
    readMetric(metadata?.replies, publicMetrics?.reply_count, metrics?.replies) *
      1.5 +
    readMetric(metadata?.quotes, publicMetrics?.quote_count, metrics?.quotes) *
      2 +
    readMetric(metadata?.numComments, metadata?.comments) * 1.5 +
    readMetric(metadata?.upvoteRatio) * 50
  );
};

const cappedEngagementScore = (engagementRaw: number): number =>
  Math.min(Math.log10(engagementRaw + 1), 6);

const sourceItemAuthorityScore = (
  item: RankableSourceItem,
  queries: readonly string[],
): number => {
  const queryHandles = queryTrustedHandles(queries);

  if (queryHandles.size === 0) {
    return 0;
  }

  const handles = compactUnique([
    item.authorHandle,
    readOptionalString(readRecord(item.metadata)?.authorHandle),
  ]).map(normalizeHandle);

  return handles.some((handle) => queryHandles.has(handle)) ? 0.35 : 0;
};

const sourceItemFreshnessScore = (
  item: RankableSourceItem,
  generatedAt: Date | undefined,
): number => {
  if (generatedAt === undefined) {
    return 0;
  }

  const ageHours = Math.max(
    0,
    (generatedAt.getTime() - item.publishedAt.getTime()) / 3_600_000,
  );

  return Math.max(0, 0.5 - ageHours / 336);
};

const readRankingMode = (value: unknown): SourceItemRankingMode => {
  if (value === undefined || value === null || value === "") {
    return defaultRankingMode;
  }

  const mode = readOptionalString(value)
    ?.replace(/-/gu, "_")
    .replace(/([a-z])([A-Z])/gu, "$1_$2")
    .toLowerCase();

  if (mode === "relevance" || mode === "relevance_first") {
    return "relevance";
  }

  if (mode === "hybrid") {
    return "hybrid";
  }

  if (mode === "engagement" || mode === "engagement_first") {
    return "engagement";
  }

  throw new Error("Unsupported source ranking mode");
};

const tokenizeQuery = (value: string): readonly string[] =>
  compactUnique(
    tokenizePlainText(value).filter((token) => !lowSignalQueryTokens.has(token)),
  );

const tokenizePlainText = (value: string): readonly string[] =>
  compactUnique(
    (value.match(/[A-Za-z0-9][A-Za-z0-9_.-]*/gu) ?? []).flatMap(
      tokenVariants,
    ),
  );

const tokenVariants = (value: string): readonly string[] => {
  const camelSplit = value.replace(/([a-z0-9])([A-Z])/gu, "$1 $2");
  const normalized = normalizeText(value);
  const splitTokens =
    camelSplit.toLowerCase().match(/[a-z0-9][a-z0-9_.-]*/gu) ?? [];
  const pluralVariants = [normalized, ...splitTokens].flatMap((token) => {
    if (token.length <= 3) {
      return [token];
    }

    return token.endsWith("s") ? [token, token.slice(0, -1)] : [token, `${token}s`];
  });

  return compactUnique([normalized, ...splitTokens, ...pluralVariants]);
};

const quotedPhrases = (value: string): readonly string[] =>
  [...value.matchAll(/"([^"]+)"/gu)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );

const queryTrustedHandles = (queries: readonly string[]): ReadonlySet<string> =>
  new Set(
    queries.flatMap((query) =>
      [...query.matchAll(/(?:^|\s)(?:from:|@)([A-Za-z0-9_]{2,30})/giu)]
        .flatMap((match) => (match[1] === undefined ? [] : [match[1]]))
        .map(normalizeHandle),
    ),
  );

const normalizeHandle = (value: string): string =>
  value.replace(/^@/u, "").trim().toLocaleLowerCase("en-US");

const normalizeText = (value: string): string =>
  value.toLowerCase().replace(/\s+/gu, " ").trim();

const lowSignalQueryTokens = new Set([
  "ai",
  "and",
  "or",
  "not",
  "the",
  "with",
  "from",
  "go",
  "since",
  "until",
  "filter",
  "lang",
  "http",
  "https",
  "www",
  "com",
]);

const readOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;

const compactUnique = (
  values: readonly (string | undefined)[],
): readonly string[] => [
  ...new Set(
    values
      .flatMap((value) => (value === undefined ? [] : [value.trim()]))
      .filter(Boolean),
  ),
];

const readRecord = (
  value: unknown,
): Readonly<Record<string, unknown>> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;

const readMetric = (...values: readonly unknown[]): number => {
  const metrics = values.flatMap((candidate): readonly number[] =>
    typeof candidate === "number" && Number.isFinite(candidate)
      ? [Math.max(0, candidate)]
      : [],
  );

  return metrics.length === 0 ? 0 : Math.max(...metrics);
};

const roundScore = (value: number): number => Math.round(value * 1_000) / 1_000;
