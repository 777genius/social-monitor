import type { SummaryModelInput } from '../../ports';

export const formatSourceHighlight = (
  item: SummaryModelInput['evidence']['items'][number],
): string => {
  const repoTrend = formatRepositoryTrendHighlight(item.providerMetadata);
  const reason = formatWhyImportant(item.relevance?.whyImportant);
  const base = repoTrend ?? item.title;

  return reason === undefined ? base : `${base} (${reason})`;
};

export const formatWhyImportant = (
  reasons: readonly string[] | undefined,
): string | undefined => {
  const uniqueReasons = [...new Set(
    (reasons ?? [])
      .map((reason) => reason.trim())
      .filter((reason) => reason.length > 0),
  )];

  if (uniqueReasons.length === 0) {
    return undefined;
  }

  const memoryReasons = uniqueReasons.filter((reason) =>
    reason.toLocaleLowerCase('en-US').includes('memory preference'),
  );
  const otherReasons = uniqueReasons.filter(
    (reason) => !memoryReasons.includes(reason),
  );

  return [...memoryReasons, ...otherReasons].slice(0, 3).join('; ');
};

export const formatRepositoryTrendHighlight = (
  metadata: unknown,
): string | undefined => {
  if (
    typeof metadata !== 'object' ||
    metadata === null ||
    Array.isArray(metadata)
  ) {
    return undefined;
  }

  const record = metadata as Readonly<Record<string, unknown>>;
  const repository = readRecord(record.repository);
  const fullName = readString(repository?.fullName);

  if (record.kind === 'github_trending_page_repository') {
    const trending = readRecord(record.trending);
    const totalStars = readNumber(repository?.totalStars);
    const starsGained = readNumber(trending?.starsGained);
    const window = readString(trending?.window) ?? 'daily';
    const rank = readNumber(trending?.rank);

    if (
      fullName === undefined ||
      totalStars === undefined ||
      starsGained === undefined ||
      rank === undefined
    ) {
      return undefined;
    }

    return `${fullName}: #${rank} on GitHub Trending ${window}, ${totalStars} stars, +${starsGained}`;
  }

  if (record.kind !== 'github_repository_trend') {
    return undefined;
  }

  const trend = readRecord(record.trend);
  const totalStars = readNumber(trend?.totalStars);
  const stars48h = readNumber(trend?.stars48h);
  const stars7d = readNumber(trend?.stars7d);
  const growthWindow = stars48h === undefined ? '7d' : '48h';
  const growth = stars48h ?? stars7d;

  if (
    fullName === undefined ||
    totalStars === undefined ||
    growth === undefined
  ) {
    return undefined;
  }

  return `${fullName}: ${totalStars} stars, +${growth} in ${growthWindow}`;
};

const readRecord = (
  value: unknown,
): Readonly<Record<string, unknown>> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;

const readNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;
