export const summarizeProviderLabels = (labels: readonly string[]): string => {
  const visible = labels.slice(0, 3);
  const hiddenCount = labels.length - visible.length;
  const visibleText = visible.join(", ");

  return hiddenCount === 0
    ? visibleText
    : `${visibleText} + ${hiddenCount} more`;
};

export const providerKeyLabel = (providerKey: string): string => {
  const knownLabels: Readonly<Record<string, string>> = {
    github: "GitHub",
    "github-issues": "GitHub Issues",
    "github-repo-radar": "GitHub Repo Radar",
    "github-trending-page": "GitHub Trending",
    "hacker-news": "Hacker News",
    reddit: "Reddit",
    rss: "RSS",
  };
  const known = knownLabels[providerKey];

  if (known !== undefined) {
    return known;
  }

  return providerKey
    .split(/[-_:\s]+/)
    .filter((part) => part.length > 0)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
};

export const uniqueStrings = (values: readonly string[]): readonly string[] => {
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
