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

export { uniqueStrings } from "./summary-provider-uniqueness";
