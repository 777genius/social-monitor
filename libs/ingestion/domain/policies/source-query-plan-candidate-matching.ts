import type { RankingEvalCandidate } from './source-ranking-eval-policy';
import type { SourceQueryPlan, SourceQueryPlanLane } from './source-query-plan';

/** Source-specific query/lane evaluation isolated from ranking score thresholds. */
export const planRetrievesCandidate = (
  plan: SourceQueryPlan,
  candidate: RankingEvalCandidate,
): boolean =>
  plan.lanes.some(
    (lane) =>
      lane.sourceKey === candidate.providerKey &&
      laneRetrievesCandidate(lane, candidate),
  );

const laneRetrievesCandidate = (
  lane: SourceQueryPlanLane,
  candidate: RankingEvalCandidate,
): boolean => {
  if (lane.operation === 'account_feed') {
    const handle = handleFromQuery(lane.query);
    return handle !== undefined && handle === normalizeHandle(candidate.authorHandle);
  }

  if (lane.operation === 'mention_search') {
    const handle = handleFromQuery(lane.query);
    const mentionText = normalizeText([candidate.title, candidate.body].join(' '));
    return handle !== undefined &&
      new RegExp('(^|[^a-z0-9_])@' + handle + '(?![a-z0-9_])', 'iu').test(mentionText);
  }

  if (lane.operation === 'listing') {
    const subreddit = subredditFromListingQuery(lane.query);
    return subreddit !== undefined && candidateSubreddit(candidate) === subreddit;
  }

  if (lane.operation === 'enrichment') {
    return false;
  }

  return searchLaneMatchesCandidate(lane.query, candidate);
};

const searchLaneMatchesCandidate = (
  query: string,
  candidate: RankingEvalCandidate,
): boolean => {
  const text = candidateText(candidate);
  const phrases = quotedPhrases(query);

  if (phrases.some((phrase) => text.includes(normalizeText(phrase)))) {
    return true;
  }

  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) {
    // All low-signal terms (e.g. "AI") still match as whole words, not substrings.
    const candidateWords = text.match(/[\p{L}\p{N}]+/gu) ?? [];
    return rawQueryTokens(query).some((token) => candidateWords.includes(token));
  }

  const matched = tokens.filter((token) => text.includes(token)).length;

  return matched >= Math.min(2, tokens.length) && matched / tokens.length >= 0.5;
};

const candidateText = (candidate: RankingEvalCandidate): string =>
  normalizeText(
    [
      candidate.title,
      candidate.body,
      candidate.authorHandle,
      candidate.canonicalUrl,
    ]
      .filter((value): value is string => value !== undefined)
      .join(' '),
  );

const candidateSubreddit = (
  candidate: RankingEvalCandidate,
): string | undefined => {
  const match = /\/r\/([^/]+)/iu.exec(candidate.canonicalUrl);

  return match?.[1]?.toLowerCase();
};

const subredditFromListingQuery = (query: string): string | undefined => {
  const [subreddit] = query.split(':');

  return subreddit === undefined || subreddit.trim().length === 0
    ? undefined
    : subreddit.trim().replace(/^r\//iu, '').toLowerCase();
};

const handleFromQuery = (query: string): string | undefined => {
  const match = /(?:from:|@)([a-z0-9_]{1,15})/iu.exec(query);

  return normalizeHandle(match?.[1]);
};

const normalizeHandle = (value: string | undefined): string | undefined =>
  value === undefined ? undefined : value.replace(/^@/u, '').toLowerCase();

const rawQueryTokens = (query: string): readonly string[] =>
  compactUnique(query.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}_.-]*/gu) ?? []);

const tokenizeQuery = (query: string): readonly string[] =>
  rawQueryTokens(query).filter((token) => !lowSignalQueryTokens.has(token));

const quotedPhrases = (value: string): readonly string[] =>
  [...value.matchAll(/"([^"]+)"/gu)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );

const normalizeText = (value: string): string =>
  value.toLowerCase().replace(/\s+/gu, ' ').trim();

const compactUnique = (values: readonly string[]): readonly string[] => [
  ...new Set(values.map((value) => value.trim()).filter(Boolean)),
];

const lowSignalQueryTokens = new Set([
  'ai',
  'and',
  'or',
  'not',
  'the',
  'with',
  'from',
  'since',
  'until',
  'filter',
  'lang',
]);
