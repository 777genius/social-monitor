import type { GitHubTrendingPageRepository } from './github-trending-page-client.port';

export const parseGitHubTrendingRepositoriesHtml = (
  html: string,
  limit: number,
): readonly GitHubTrendingPageRepository[] => {
  const articles = html.match(/<article\b[\s\S]*?<\/article>/gu) ?? [];

  return articles
    .flatMap((article, index) => parseArticle(article, index + 1))
    .slice(0, normalizeLimit(limit));
};

const parseArticle = (
  article: string,
  rank: number,
): readonly GitHubTrendingPageRepository[] => {
  const link =
    /<h2\b[\s\S]*?<a\b[^>]*href="\/([^/"?#]+)\/([^/"?#]+)"[^>]*>[\s\S]*?<\/a>/u.exec(
      article,
    );

  if (link === null) {
    return [];
  }

  const owner = decodePathSegment(link[1]);
  const repo = decodePathSegment(link[2]);
  const fullName = `${owner}/${repo}`;
  const url = `https://github.com/${fullName}`;
  const starsGained = readTrendingStars(stripTags(article));

  return [
    {
      fullName,
      url,
      description: readDescription(article),
      language: readLanguage(article),
      totalStars: readAnchorNumber(article, `/${owner}/${repo}/stargazers`),
      forksCount: readAnchorNumber(article, `/${owner}/${repo}/forks`),
      starsGained,
      rank,
    },
  ];
};

const readDescription = (article: string): string | undefined => {
  const match = /<p\b[^>]*>([\s\S]*?)<\/p>/u.exec(article);

  return cleanText(match?.[1]);
};

const readLanguage = (article: string): string | undefined => {
  const match =
    /<span\b[^>]*itemprop="programmingLanguage"[^>]*>([\s\S]*?)<\/span>/u.exec(
      article,
    );

  return cleanText(match?.[1]);
};

const readAnchorNumber = (article: string, href: string): number => {
  const pattern = new RegExp(
    `<a\\b[^>]*href="${escapeRegExp(href)}"[^>]*>([\\s\\S]*?)<\\/a>`,
    'u',
  );
  const match = pattern.exec(article);

  return readFirstNumber(cleanText(match?.[1]));
};

const readTrendingStars = (text: string): number => {
  const match = /([\d,]+)\s+stars?\s+(?:today|this week|this month)/iu.exec(
    text,
  );

  return readFirstNumber(match?.[1]);
};

const cleanText = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const cleaned = decodeHtmlEntities(stripTags(value))
    .replace(/\s+/gu, ' ')
    .trim();

  return cleaned.length === 0 ? undefined : cleaned;
};

const stripTags = (value: string): string => value.replace(/<[^>]+>/gu, ' ');

const readFirstNumber = (value: string | undefined): number => {
  const match = /[\d,]+/u.exec(value ?? '');

  return match === null ? 0 : Number(match[0].replace(/,/gu, ''));
};

const decodePathSegment = (value: string | undefined): string =>
  decodeURIComponent((value ?? '').trim());

const decodeHtmlEntities = (value: string): string =>
  value
    .replace(/&#(\d+);/gu, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([\da-f]+);/giu, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>');

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

const normalizeLimit = (limit: number): number =>
  Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 25;
