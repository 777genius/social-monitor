import type { SummaryModelInput } from '../../ports';

export const buildSummaryHeadline = (
  selectedItems: SummaryModelInput['evidence']['items'],
): string => {
  const itemCount = selectedItems.length;
  const providerLabels = uniqueStrings(
    selectedItems.map((item) => providerKeyLabel(item.providerKey)),
  );

  if (itemCount === 0 || providerLabels.length === 0) {
    return 'Topic summary';
  }

  const itemLabel = itemCount === 1 ? 'item' : 'items';
  const sourceLabel = providerLabels.length === 1 ? 'source' : 'sources';

  return `Topic summary: ${itemCount} ${itemLabel} across ${providerLabels.length} ${sourceLabel} (${summarizeProviderLabels(providerLabels)})`;
};

const summarizeProviderLabels = (labels: readonly string[]): string => {
  const visible = labels.slice(0, 3);
  const hiddenCount = labels.length - visible.length;
  const visibleText = visible.join(', ');

  return hiddenCount === 0
    ? visibleText
    : `${visibleText} + ${hiddenCount} more`;
};

const providerKeyLabel = (providerKey: string): string => {
  const knownLabels: Readonly<Record<string, string>> = {
    github: 'GitHub',
    'github-issues': 'GitHub Issues',
    'github-repo-radar': 'GitHub Repo Radar',
    'github-trending-page': 'GitHub Trending',
    'hacker-news': 'Hacker News',
    reddit: 'Reddit',
    rss: 'RSS',
  };
  const known = knownLabels[providerKey];

  if (known !== undefined) {
    return known;
  }

  return providerKey
    .split(/[-_:\s]+/)
    .filter((part) => part.length > 0)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');
};

const uniqueStrings = (values: readonly string[]): readonly string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }

  return result;
};
