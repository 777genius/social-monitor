import type { ReaderSummaryCitation } from "../entities/citation";
import type { SourceMixEntry } from "../entities/source-mix-entry";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import type {
  ReaderSummaryQualityFlag,
  ReaderSummaryQualityState,
} from "../value-objects/summary-quality";
import { compactUnique, uniqueNonEmpty } from "../value-objects/summary-text";

export type SourceMixQualityPolicyInput = {
  readonly selectedEvidence?: readonly SummaryEvidenceItem[];
  readonly citationMap: readonly ReaderSummaryCitation[];
  readonly storyClusters: readonly StoryCluster[];
};

export const buildSourceMix = (
  input: SourceMixQualityPolicyInput,
): readonly SourceMixEntry[] => {
  const counts = new Map<
    string,
    {
      itemIds: Set<string>;
      citationIds: Set<string>;
      storyClusterIds: Set<string>;
      crossSourceClusterIds: Set<string>;
      interestIds: Set<string>;
    }
  >();

  for (const item of input.selectedEvidence ?? []) {
    const current = sourceMixCount(counts, item.providerKey);
    current.itemIds.add(item.feedItemId);
    current.interestIds.add(item.interestId);
  }

  for (const citation of input.citationMap) {
    const current = sourceMixCount(counts, citation.providerKey);
    current.itemIds.add(citation.feedItemId);
    current.citationIds.add(citation.citationId);
  }

  for (const cluster of input.storyClusters) {
    const isCrossSource = cluster.providerKeys.length > 1;
    for (const providerKey of cluster.providerKeys) {
      const current = sourceMixCount(counts, providerKey);
      current.storyClusterIds.add(cluster.id);
      if (isCrossSource) {
        current.crossSourceClusterIds.add(cluster.id);
      }
      for (const interestId of cluster.interestIds) {
        current.interestIds.add(interestId);
      }
    }
  }

  return [...counts.entries()]
    .map(([providerKey, value]) => ({
      providerKey,
      itemCount: value.itemIds.size,
      citationCount: value.citationIds.size,
      storyClusterCount: value.storyClusterIds.size,
      crossSourceClusterCount: value.crossSourceClusterIds.size,
      singleSourceOnly: value.crossSourceClusterIds.size === 0,
      interestIds: [...value.interestIds].sort(),
    }))
    .sort(
      (left, right) =>
        providerFamilyPriority(left.providerKey) -
          providerFamilyPriority(right.providerKey) ||
        right.itemCount - left.itemCount ||
        right.storyClusterCount - left.storyClusterCount ||
        left.providerKey.localeCompare(right.providerKey),
    );
};

export const buildReaderSummaryQualityState = (
  qualityFlags: readonly ReaderSummaryQualityFlag[],
  sourceMix: readonly SourceMixEntry[],
): ReaderSummaryQualityState => {
  const flags = uniqueNonEmpty(
    qualityFlags,
  ) as readonly ReaderSummaryQualityFlag[];
  const isSingleSource = sourceMix.length === 1;
  const hasOnlySourceLocalStories =
    sourceMix.length > 1 &&
    sourceMix.every((source) => source.singleSourceOnly);
  const warnings = compactUnique([
    flags.includes("partial_evidence")
      ? "Only partial evidence was available for this summary."
      : undefined,
    flags.includes("context_unavailable")
      ? "Additional context was unavailable during generation."
      : undefined,
    flags.includes("provider_failed")
      ? "At least one source provider failed during generation."
      : undefined,
    flags.includes("limited_sources") || isSingleSource
      ? "Source coverage is limited and needs confirmation."
      : undefined,
    hasOnlySourceLocalStories
      ? "Top reads need confirmation from another monitored provider before acting on important claims."
      : undefined,
    flags.includes("low_confidence")
      ? "The model marked this summary as low confidence."
      : undefined,
    flags.includes("conflicting_evidence")
      ? "Some cited evidence conflicts across sources."
      : undefined,
  ]);

  return {
    status: qualityStatus(flags, isSingleSource),
    flags,
    warnings,
    isSingleSource,
  };
};

const socialNewsProviderFamilyOrder = [
  "x-twitter",
  "reddit",
  "hacker-news",
  "rss",
  "github",
] as const;

const providerFamilyPriority = (providerKey: string): number => {
  const family = providerFamilyKey(providerKey);
  const index = socialNewsProviderFamilyOrder.findIndex(
    (candidate) => candidate === family,
  );

  return index === -1 ? socialNewsProviderFamilyOrder.length : index;
};

const providerFamilyKey = (providerKey: string): string => {
  const normalized = providerKey.toLowerCase();

  if (
    normalized === "x-twitter" ||
    normalized === "twitter" ||
    normalized === "x"
  ) {
    return "x-twitter";
  }

  if (normalized === "hacker-news" || normalized === "hn") {
    return "hacker-news";
  }

  if (normalized === "github" || normalized.startsWith("github-")) {
    return "github";
  }

  return normalized;
};

const sourceMixCount = (
  counts: Map<
    string,
    {
      itemIds: Set<string>;
      citationIds: Set<string>;
      storyClusterIds: Set<string>;
      crossSourceClusterIds: Set<string>;
      interestIds: Set<string>;
    }
  >,
  providerKey: string,
) => {
  const current = counts.get(providerKey) ?? {
    itemIds: new Set<string>(),
    citationIds: new Set<string>(),
    storyClusterIds: new Set<string>(),
    crossSourceClusterIds: new Set<string>(),
    interestIds: new Set<string>(),
  };
  counts.set(providerKey, current);

  return current;
};

const qualityStatus = (
  flags: readonly ReaderSummaryQualityFlag[],
  isSingleSource: boolean,
): ReaderSummaryQualityState["status"] => {
  if (flags.includes("no_signal")) {
    return "no_signal";
  }
  if (flags.includes("provider_failed")) {
    return "failed_provider";
  }
  if (
    flags.includes("partial_evidence") ||
    flags.includes("context_unavailable")
  ) {
    return "partial";
  }
  if (flags.includes("low_confidence")) {
    return "low_confidence";
  }
  if (flags.includes("limited_sources") || isSingleSource) {
    return "limited_sources";
  }

  return "ready";
};
