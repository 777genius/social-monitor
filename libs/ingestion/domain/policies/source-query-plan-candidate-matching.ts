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
    return handleFromQuery(lane.query) === normalizeHandle(candidate.authorHandle);
  }

  if (lane.operation === 'mention_search') {
    const handle = handleFromQuery(lane.query);

    return handle !== undefined && candidateText(candidate).includes(handle);
  }

  if (lane.operation === 'listing') {
    return candidateSubreddit(candidate) === subredditFromListingQuery(lane.query);
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
    return false;
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

const tokenizeQuery = (query: string): readonly string[] =>
  compactUnique(
    (query.toLowerCase().match(/[a-z0-9][a-z0-9_.-]*/gu) ?? []).filter(
      (token) => !lowSignalQueryTokens.has(token),
    ),
  );

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
