import { formatRepositoryTrendHighlight } from "./deterministic-summary-repository-trend-highlight";
export { formatRepositoryTrendHighlight } from "./deterministic-summary-repository-trend-highlight";
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
