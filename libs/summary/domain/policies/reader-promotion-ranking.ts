import type { ReaderValueAnswers } from
  "@social-monitor/relevance/domain/reader-value/reader-value-assessment";

import { canonicalReaderSummaryPreparationTimestamp } from
  "../value-objects/reader-summary-preparation";
import {
  readerPostPromotionMetricMature,
  readerPostPromotionPopularityByCandidate,
  readerPostPromotionSignalScore,
  type ReaderPostPromotionPopularity,
} from "./reader-post-promotion-engagement";
import { readerPromotionNewsPublisher } from "./reader-promotion-news-publisher";
import {
  compareReaderPromotionScoreDesc,
  readerPromotionScore,
} from "./reader-promotion-score";
import {
  READER_PROMOTION_SOURCE_REGISTRY,
  readerPromotionEngagementClass,
  type ReaderPromotionEngagementClass,
  type ReaderPromotionSourceRegistry,
} from "./reader-promotion-source-registry";

/**
 * Stamp of what the reader promotion order means. It is persisted on every
 * promoted card and attestation. Change it whenever ordering, gate or block
 * membership changes meaning: artifacts carrying another stamp are then read
 * back as "rebuild required" instead of failing validation.
 */
export const READER_PROMOTION_POLICY_STAMP = "reader_promotion.2026-10-30" as const;

/**
 * Block sizes, all in one place.
 *
 * - `top`: the first 12 ranked posts in comparator order. There is no
 *   per-network cap: with a cap of 4 per family, weak HN stories with 1-3
 *   points filled Top while stronger X and Reddit posts waited behind it,
 *   and Top often ended at 9-10 posts. Networks are already made comparable
 *   by the per-family percentile.
 * - `rankedTotal`: Top plus "Show more" (additional), same order.
 * - `news`: the "News without rating" block.
 *
 * 48 + 16 = 64 equals the headline verification budget
 * (`maxPresentationCandidates`, see READER_PROMOTION_PRESENTATION_BUDGET):
 * every published card needs one verified headline, and a failed headline
 * also spends budget. A day with failed headlines therefore publishes fewer
 * cards and is marked coverage-limited instead of silently skipping stories.
 */
export const READER_PROMOTION_LIMITS = Object.freeze({
  top: 12,
  rankedTotal: 48,
  news: 16,
});

export const READER_PROMOTION_PRESENTATION_BUDGET =
  READER_PROMOTION_LIMITS.rankedTotal + READER_PROMOTION_LIMITS.news;

export type ReaderPromotionUsefulness = ReaderValueAnswers["usefulness"]["choice"];
export type ReaderPromotionRelevance = ReaderValueAnswers["relevance"]["choice"];

export type ReaderPromotionEngagementInput = {
  /** Provider signal value (see ReaderPostPromotionSignalMethod). */
  readonly value: number;
  /** UTC time the metric snapshot was taken. */
  readonly observedAt: string;
};

/**
 * Plain, JSON-compatible input of the ranking core. Production candidates
 * extend it; an offline preview can pass exactly these fields.
 */
export type ReaderPromotionCandidateInput = {
  readonly candidateId: string;
  readonly providerKey: string;
  /** Registry family, e.g. "x", "reddit", "hacker_news", "github_radar", "rss". */
  readonly providerFamily: string;
  /** Same post matched by several interests; defaults to candidateId. */
  readonly sourceItemId?: string;
  readonly storyId: string;
  readonly publishedAt: string;
  readonly usefulness: ReaderPromotionUsefulness;
  readonly relevance: ReaderPromotionRelevance;
  /** `null` means unknown: missing, not yet observed or malformed. */
  readonly engagement: ReaderPromotionEngagementInput | null;
  /** Source title; used only to read the publisher of news.google.com items. */
  readonly title: string;
  /** Canonical source URL; needed only for the news.google.com publisher rule. */
  readonly canonicalIdentity?: string;
  /** Headline verification state; an offline preview may omit it. */
  readonly presentation?: {
    readonly status: "available" | "unavailable" | "pending" | "budget_exhausted";
  };
  /** Technical gate decided by the caller (scope, identity, safety...). */
  readonly eligible?: boolean;
  /** GitHub Trending appendix rows never become posts. */
  readonly appendixOnly?: boolean;
};

export type ReaderPromotionRankingFacts = {
  readonly block: ReaderPromotionEngagementClass;
  /** Ranked post whose metric was observed at least 6h after publication. */
  readonly metricMature: boolean;
  /**
   * Present only for a mature metric in a family with at least
   * READER_PROMOTION_MIN_POPULARITY_COHORT mature gate-passed posts.
   */
  readonly popularity: ReaderPostPromotionPopularity | null;
  /** Card "Signal" value: percentile * 10, or 0 when unknown. */
  readonly signalScore: number;
  /** Real publisher of a news.google.com item; `null` otherwise. */
  readonly newsPublisher: string | null;
};

export type ReaderPromotionRanked<T> = T & {
  readonly ranking: ReaderPromotionRankingFacts;
};

export type ReaderPromotionExclusionReason =
  | "technical_ineligible"
  | "semantic_not_admitted"
  | "appendix_only"
  | "story_representative"
  | "news_publisher_duplicate"
  | "presentation_unavailable"
  | "presentation_budget_exhausted"
  | "capacity_exhausted";

export type ReaderPromotionRankingResult<T> = {
  readonly policyVersion: typeof READER_PROMOTION_POLICY_STAMP;
  readonly outcome: "ready" | "no_signal" | "presentation_unavailable" |
    "budget_exhausted";
  /** "Top posts": the first 12 ranked posts. */
  readonly top: readonly ReaderPromotionRanked<T>[];
  /** "Show more": the remaining ranked posts in the same order. */
  readonly additional: readonly ReaderPromotionRanked<T>[];
  /** "News without rating": posts from unranked sources only. */
  readonly news: readonly ReaderPromotionRanked<T>[];
  readonly excluded: readonly {
    readonly candidateId: string;
    readonly reason: ReaderPromotionExclusionReason;
  }[];
};

/** Everything the comparators read; attestations sign exactly these values. */
export type ReaderPromotionOrderKey = {
  readonly usefulness: ReaderPromotionUsefulness;
  readonly popularity: ReaderPostPromotionPopularity | null;
  readonly publishedAt: string;
  readonly candidateId: string;
};

const usefulnessRank: Readonly<Record<ReaderPromotionUsefulness, number>> =
  Object.freeze({
    important: 3, useful: 2, context: 1, noise: 0, insufficient_context: -1,
  });

/**
 * Order inside "Top posts" and "Show more" (one sequence):
 *
 * 1. hybrid score, descending: 0.4 * model + 0.6 * popularity, exact
 *    (see `readerPromotionScore`);
 * 2. publishedAt, newest first;
 * 3. candidateId, UTF-8 bytes ascending.
 *
 * Relevance is a gate (relevant or central), not an order key. Networks are
 * never compared by raw numbers, only by percentile inside their own family.
 * The ranking core, the pre-publication order validation (attestation) and
 * the publication guard all use this one comparator.
 *
 * Example: ten Reddit posts with distinct mature scores. A useful post with
 * 984 upvotes has 9 below it: percentile (9 + 1/2) / 10 = 0.95, score
 * 0.2 + 0.57 = 0.77. An important post with 0 upvotes: percentile 0.05,
 * score 0.4 + 0.03 = 0.43. An important post with an unknown metric: 0.4.
 * Order: useful 984, important 0, important unknown.
 */
export const compareRankedReaderPromotion = (
  left: ReaderPromotionOrderKey,
  right: ReaderPromotionOrderKey,
): number =>
  compareReaderPromotionScoreDesc(readerPromotionScore(left), readerPromotionScore(right)) ||
  compareTimestampDesc(left.publishedAt, right.publishedAt) ||
  compareUtf8Bytes(left.candidateId, right.candidateId);

/**
 * Order inside "News without rating": usefulness, then publishedAt newest
 * first, then candidateId. Popularity is never read here.
 */
export const compareUnrankedReaderPromotion = (
  left: ReaderPromotionOrderKey,
  right: ReaderPromotionOrderKey,
): number =>
  usefulnessRank[right.usefulness] - usefulnessRank[left.usefulness] ||
  compareTimestampDesc(left.publishedAt, right.publishedAt) ||
  compareUtf8Bytes(left.candidateId, right.candidateId);

export const readerPromotionSemanticallyAdmitted = (candidate: {
  readonly usefulness: ReaderPromotionUsefulness;
  readonly relevance: ReaderPromotionRelevance;
}): boolean =>
  (candidate.usefulness === "useful" || candidate.usefulness === "important") &&
  (candidate.relevance === "relevant" || candidate.relevance === "central");

/**
 * The reader promotion ranking core: one pure function, no IO, no model
 * calls. It applies the gate, assigns each post to exactly one block through
 * the source registry, computes metric maturity and per-network percentiles,
 * orders both blocks, keeps one post per story on the page and one per real
 * publisher for news.google.com, and cuts the blocks to
 * READER_PROMOTION_LIMITS. There is no per-network cap. Unavailable
 * headlines fall through to the next post of the same story.
 *
 * Story ownership: a story found in both blocks is shown in "News without
 * rating" only when its best news post is strictly more useful than its best
 * ranked post (an important Reuters article over a useful X post); on a tie
 * it stays ranked, where it carries a measured signal. A story moved to news
 * that does not fit there (capacity, publisher rule) returns to the ranked
 * block instead of disappearing from the page.
 */
export const rankReaderPromotionCandidates = <T extends ReaderPromotionCandidateInput>(
  candidates: readonly T[],
  registry: ReaderPromotionSourceRegistry = READER_PROMOTION_SOURCE_REGISTRY,
): ReaderPromotionRankingResult<T> => {
  assertRankingInput(candidates, registry);
  const exclusions: Array<{ candidateId: string; reason: ReaderPromotionExclusionReason }> = [];
  const admitted: T[] = [];
  for (const candidate of [...candidates].sort((left, right) =>
    compareUtf8Bytes(left.candidateId, right.candidateId))) {
    const reason = candidate.eligible === false ? "technical_ineligible"
      : !readerPromotionSemanticallyAdmitted(candidate) ? "semantic_not_admitted"
        : candidate.appendixOnly === true ? "appendix_only" : undefined;
    if (reason === undefined) admitted.push(candidate);
    else exclusions.push({ candidateId: candidate.candidateId, reason });
  }
  if (admitted.length === 0) return freeze("no_signal", [], [], [], exclusions);

  const ranked = withRankingFacts(admitted, registry);
  const rankedBlock = ranked.filter((item) => item.ranking.block === "ranked")
    .sort((left, right) => compareRankedReaderPromotion(orderKey(left), orderKey(right)));
  const newsBlock = ranked.filter((item) => item.ranking.block === "unranked")
    .sort((left, right) => compareUnrankedReaderPromotion(orderKey(left), orderKey(right)));
  let newsStories = storiesOwnedByNews(rankedBlock, newsBlock);
  let board = arrangeBlocks(rankedBlock, newsBlock, newsStories);
  // Terminates: every pass returns at least one story to the ranked block.
  for (;;) {
    const shown = new Set(board.news.map((candidate) => candidate.storyId));
    if ([...newsStories].every((storyId) => shown.has(storyId))) break;
    newsStories = new Set([...newsStories].filter((storyId) => shown.has(storyId)));
    board = arrangeBlocks(rankedBlock, newsBlock, newsStories);
  }
  exclusions.push(...board.exclusions);
  if (board.rankedReady.length + board.newsReady.length === 0) {
    return freeze(exclusions.some((item) => item.reason === "presentation_unavailable")
      ? "presentation_unavailable" : "budget_exhausted", [], [], [], exclusions);
  }
  for (const candidate of [...board.rankedReady.slice(READER_PROMOTION_LIMITS.rankedTotal),
    ...board.newsReady.slice(READER_PROMOTION_LIMITS.news)]) {
    exclusions.push({ candidateId: candidate.candidateId, reason: "capacity_exhausted" });
  }
  return freeze("ready", board.top, board.additional, board.news, exclusions);
};

/**
 * One page layout for a given set of news-owned stories: ranked posts of
 * those stories step aside, then news skips every story Top or Show more
 * already carries. Stories cut by ranked capacity may still reach news.
 */
const arrangeBlocks = <T extends ReaderPromotionCandidateInput>(
  rankedBlock: readonly ReaderPromotionRanked<T>[],
  newsBlock: readonly ReaderPromotionRanked<T>[],
  newsStories: ReadonlySet<string>,
) => {
  const exclusions: Array<{ candidateId: string; reason: ReaderPromotionExclusionReason }> = [];
  const rankedReady = storyRepresentatives(rankedBlock, exclusions, newsStories);
  const top = rankedReady.slice(0, READER_PROMOTION_LIMITS.top);
  const additional = rankedReady.slice(READER_PROMOTION_LIMITS.top,
    READER_PROMOTION_LIMITS.rankedTotal);
  const shownRanked = [...top, ...additional];
  const newsReady = storyRepresentatives(newsBlock, exclusions,
    new Set(shownRanked.map((candidate) => candidate.storyId)),
    new Set(shownRanked.map((candidate) => candidate.sourceItemId ?? candidate.candidateId)));
  return { rankedReady, newsReady, top, additional,
    news: newsReady.slice(0, READER_PROMOTION_LIMITS.news), exclusions };
};

/** Stories whose best verified news post is strictly more useful than their best ranked post. */
const storiesOwnedByNews = <T extends ReaderPromotionCandidateInput>(
  rankedBlock: readonly ReaderPromotionRanked<T>[],
  newsBlock: readonly ReaderPromotionRanked<T>[],
): Set<string> => {
  const bestUsefulness = (block: readonly ReaderPromotionRanked<T>[]) => {
    const best = new Map<string, number>();
    for (const candidate of block) {
      if ((candidate.presentation?.status ?? "available") !== "available") continue;
      best.set(candidate.storyId, Math.max(best.get(candidate.storyId) ?? -Infinity,
        usefulnessRank[candidate.usefulness]));
    }
    return best;
  };
  const ranked = bestUsefulness(rankedBlock);
  return new Set([...bestUsefulness(newsBlock)]
    .filter(([storyId, usefulness]) => usefulness > (ranked.get(storyId) ?? Infinity))
    .map(([storyId]) => storyId));
};

export const readerPromotionOrderKey = (candidate: {
  readonly usefulness: ReaderPromotionUsefulness;
  readonly publishedAt: string;
  readonly candidateId: string;
  readonly ranking: Pick<ReaderPromotionRankingFacts, "popularity">;
}): ReaderPromotionOrderKey => ({
  usefulness: candidate.usefulness,
  popularity: candidate.ranking.popularity,
  publishedAt: candidate.publishedAt,
  candidateId: candidate.candidateId,
});

const orderKey = readerPromotionOrderKey;

const withRankingFacts = <T extends ReaderPromotionCandidateInput>(
  admitted: readonly T[],
  registry: ReaderPromotionSourceRegistry,
): ReaderPromotionRanked<T>[] => {
  const blockOf = (candidate: T): ReaderPromotionEngagementClass =>
    readerPromotionEngagementClass(candidate.providerFamily, registry)!;
  const mature = (candidate: T): boolean => {
    const engagement = usableEngagement(candidate.engagement);
    return blockOf(candidate) === "ranked" && engagement !== null &&
      readerPostPromotionMetricMature(engagement, candidate.publishedAt);
  };
  const popularity = readerPostPromotionPopularityByCandidate(admitted
    .filter(mature).map((candidate) => ({
      candidateId: candidate.candidateId,
      sourceItemId: candidate.sourceItemId ?? candidate.candidateId,
      providerFamily: candidate.providerFamily,
      value: candidate.engagement!.value,
    })));
  return admitted.map((candidate) => {
    const block = blockOf(candidate);
    const value = popularity.get(candidate.candidateId) ?? null;
    return { ...candidate, ranking: Object.freeze({
      block,
      metricMature: mature(candidate),
      popularity: value,
      signalScore: readerPostPromotionSignalScore(value),
      newsPublisher: block === "unranked" ? readerPromotionNewsPublisher({
        canonicalIdentity: candidate.canonicalIdentity ?? "",
        title: candidate.title,
      }) : null,
    }) };
  });
};

/**
 * Walks one ordered block and keeps the first post of every story whose
 * headline is verified. A post sharing a story, a source item or (for
 * news.google.com) a publisher with an already kept or reserved post is
 * skipped; a post whose headline is unavailable lets the next post of the
 * story compete.
 */
const storyRepresentatives = <T extends ReaderPromotionCandidateInput>(
  ordered: readonly ReaderPromotionRanked<T>[],
  exclusions: Array<{ candidateId: string; reason: ReaderPromotionExclusionReason }>,
  reservedStories: ReadonlySet<string> = new Set(),
  reservedSources: ReadonlySet<string> = new Set(),
): ReaderPromotionRanked<T>[] => {
  const stories = new Set(reservedStories);
  const sources = new Set(reservedSources);
  const publishers = new Set<string>();
  const ready: ReaderPromotionRanked<T>[] = [];
  for (const candidate of ordered) {
    const source = candidate.sourceItemId ?? candidate.candidateId;
    const publisher = candidate.ranking.newsPublisher;
    if (stories.has(candidate.storyId) || sources.has(source)) {
      exclusions.push({ candidateId: candidate.candidateId, reason: "story_representative" });
      continue;
    }
    if (publisher !== null && publishers.has(publisher)) {
      exclusions.push({ candidateId: candidate.candidateId, reason: "news_publisher_duplicate" });
      continue;
    }
    const status = candidate.presentation?.status ?? "available";
    if (status === "available") {
      ready.push(candidate);
      stories.add(candidate.storyId);
      sources.add(source);
      if (publisher !== null) publishers.add(publisher);
      continue;
    }
    exclusions.push({ candidateId: candidate.candidateId,
      reason: status === "unavailable" ? "presentation_unavailable"
        : "presentation_budget_exhausted" });
  }
  return ready;
};

/** A malformed metric is treated as unknown, never as zero. */
const usableEngagement = (
  engagement: ReaderPromotionEngagementInput | null,
): ReaderPromotionEngagementInput | null => {
  if (engagement === null || !Number.isFinite(engagement.value) ||
      engagement.value < 0) return null;
  try {
    canonicalReaderSummaryPreparationTimestamp(engagement.observedAt);
    return engagement;
  } catch {
    return null;
  }
};

const assertRankingInput = (
  candidates: readonly ReaderPromotionCandidateInput[],
  registry: ReaderPromotionSourceRegistry,
): void => {
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (candidate.candidateId.trim().length === 0 || seen.has(candidate.candidateId) ||
        candidate.storyId.trim().length === 0) {
      throw new Error("Reader promotion candidate ids must be unique and non-empty");
    }
    if (readerPromotionEngagementClass(candidate.providerFamily, registry) === undefined) {
      throw new Error(`Reader promotion source family is not registered: ${
        candidate.providerFamily}`);
    }
    timestampMicros(candidate.publishedAt);
    seen.add(candidate.candidateId);
  }
};

const compareTimestampDesc = (left: string, right: string): number => {
  const leftMicros = timestampMicros(left);
  const rightMicros = timestampMicros(right);
  return leftMicros === rightMicros ? 0 : leftMicros > rightMicros ? -1 : 1;
};

const timestampMicros = (value: string): bigint => {
  const canonical = canonicalReaderSummaryPreparationTimestamp(value);
  return BigInt(Date.parse(`${canonical.slice(0, 23)}Z`)) * 1_000n +
    BigInt(canonical.slice(23, 26));
};

const compareUtf8Bytes = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));

const freeze = <T>(
  outcome: ReaderPromotionRankingResult<T>["outcome"],
  top: readonly ReaderPromotionRanked<T>[],
  additional: readonly ReaderPromotionRanked<T>[],
  news: readonly ReaderPromotionRanked<T>[],
  excluded: readonly { candidateId: string; reason: ReaderPromotionExclusionReason }[],
): ReaderPromotionRankingResult<T> => Object.freeze({
  policyVersion: READER_PROMOTION_POLICY_STAMP,
  outcome,
  top: Object.freeze([...top]),
  additional: Object.freeze([...additional]),
  news: Object.freeze([...news]),
  excluded: Object.freeze(excluded.map((item) => Object.freeze({ ...item }))),
});
