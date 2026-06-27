import type { ReaderSummaryModelInput } from "../../ports";

export const buildReaderHeadline = (
  input: ReaderSummaryModelInput,
  selectedEvidence: ReaderSummaryModelInput["evidence"]["selectedEvidence"],
): string => {
  const scopeLabel = input.scope.type === "workspace" ? "Workspace" : "Topic";
  const storyCount = selectedEvidence.length;
  const providerLabels = uniqueStrings(selectedEvidence.map(providerLabel));

  if (storyCount === 0 || providerLabels.length === 0) {
    return `${scopeLabel} briefing`;
  }

  const storyLabel = storyCount === 1 ? "story" : "stories";
  const sourceLabel = providerLabels.length === 1 ? "source" : "sources";

  return `${scopeLabel} briefing: ${storyCount} ${storyLabel} across ${providerLabels.length} ${sourceLabel} (${summarizeProviderLabels(providerLabels)})`;
};

const summarizeProviderLabels = (labels: readonly string[]): string => {
  const visible = labels.slice(0, 3);
  const hiddenCount = labels.length - visible.length;
  const visibleText = visible.join(", ");

  return hiddenCount === 0
    ? visibleText
    : `${visibleText} + ${hiddenCount} more`;
};

const providerLabel = (
  evidence: ReaderSummaryModelInput["evidence"]["selectedEvidence"][number],
): string => evidence.providerName ?? providerKeyLabel(evidence.providerKey);

const providerKeyLabel = (providerKey: string): string => {
  const knownLabels: Readonly<Record<string, string>> = {
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
