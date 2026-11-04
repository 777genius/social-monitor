import type { AlgoliaHit, AlgoliaSearchResponse } from './hacker-news-algolia-contracts';
import { hasExhaustiveHitCount } from './hacker-news-algolia-policy';

const historicalPageSize = 100;
const historicalPageCeiling = 10;
const historicalRequestBudget = 512;

/** Recursively split crowded Algolia result windows until page completeness is provable. */
export async function searchCompleteHackerNewsWindow(
  baseUrl: URL,
  from: Date,
  to: Date,
  fetchJson: (url: string) => Promise<AlgoliaSearchResponse>,
): Promise<readonly AlgoliaHit[]> {
  const startSecond = Math.ceil(from.getTime() / 1000);
  const endSecond = Math.ceil(to.getTime() / 1000);
  if (startSecond >= endSecond) return [];
  let requests = 0;
  const fetchPage = async (url: URL): Promise<AlgoliaSearchResponse> => {
    if (requests >= historicalRequestBudget) {
      throw new Error('Hacker News historical search incomplete: request budget exhausted');
    }
    requests += 1;
    return fetchJson(url.toString());
  };
  const searchInterval = async (start: number, end: number): Promise<readonly AlgoliaHit[]> => {
    const url = new URL(baseUrl);
    url.searchParams.set('numericFilters', `created_at_i>${start - 1},created_at_i<${end}`);
    url.searchParams.set('hitsPerPage', String(historicalPageSize));
    url.searchParams.set('page', '0');
    const first = await fetchPage(url);
    const count = first.nbHits;
    const pages = first.nbPages;
    if (!Number.isSafeInteger(count) || count === undefined || count < 0 ||
        !Number.isSafeInteger(pages) || pages === undefined || pages < 0 || first.page !== 0 ||
        !Array.isArray(first.hits)) {
      throw new Error('Hacker News historical search incomplete: unknown Algolia coverage');
    }
    if (count > historicalPageSize * historicalPageCeiling || pages > historicalPageCeiling) {
      const middle = start + Math.floor((end - start) / 2);
      if (middle <= start || middle >= end) {
        throw new Error('Hacker News historical search incomplete: provider pagination ceiling');
      }
      return [...await searchInterval(start, middle), ...await searchInterval(middle, end)];
    }
    if (!hasExhaustiveHitCount(first) || pages !== Math.ceil(count / historicalPageSize)) {
      throw new Error('Hacker News historical search incomplete: unknown Algolia coverage');
    }
    const hits = [...first.hits];
    for (let page = 1; page < pages; page += 1) {
      url.searchParams.set('page', String(page));
      const response = await fetchPage(url);
      if (!hasExhaustiveHitCount(response) || response.nbHits !== count || response.nbPages !== pages ||
          response.page !== page || !Array.isArray(response.hits)) {
        throw new Error('Hacker News historical search incomplete: inconsistent Algolia page');
      }
      hits.push(...response.hits);
    }
    if (hits.length !== count || new Set(hits.map((hit) => hit.objectID)).size !== count ||
        hits.some((hit) => hit.objectID === undefined || !Number.isInteger(Number(hit.objectID)) ||
          !Number.isInteger(hit.created_at_i) || hit.created_at_i! < start || hit.created_at_i! >= end)) {
      throw new Error('Hacker News historical search incomplete: missing, duplicate or unbounded hits');
    }
    return hits;
  };
  return searchInterval(startSecond, endSecond);
}
