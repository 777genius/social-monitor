import type {
  BriefingQualityFlag,
  BriefingReaderQualityState,
  BriefingSourceMixEntry,
} from '../entities/briefing-artifact';
import type { BriefingReaderBriefFactoryInput } from './briefing-reader-brief.factory';
import {
  compactUnique,
  uniqueNonEmpty,
} from './briefing-reader-brief-support';

export const buildSourceMix = (
  input: BriefingReaderBriefFactoryInput,
): readonly BriefingSourceMixEntry[] => {
  const counts = new Map<
    string,
    {
      itemIds: Set<string>;
      citationIds: Set<string>;
      storyClusterIds: Set<string>;
      crossSourceClusterIds: Set<string>;
      topicIds: Set<string>;
    }
  >();
  for (const item of input.selectedEvidence ?? []) {
    const current = sourceMixCount(counts, item.providerKey);
    current.itemIds.add(item.feedItemId);
    current.topicIds.add(item.topicId);
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
      for (const topicId of cluster.topicIds) {
        current.topicIds.add(topicId);
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
      topicIds: [...value.topicIds].sort(),
    }))
    .sort(
      (left, right) =>
        right.itemCount - left.itemCount ||
        right.storyClusterCount - left.storyClusterCount ||
        left.providerKey.localeCompare(right.providerKey),
    );
};

export const buildQualityState = (
  qualityFlags: readonly BriefingQualityFlag[],
  sourceMix: readonly BriefingSourceMixEntry[],
): BriefingReaderQualityState => {
  const flags = uniqueNonEmpty(qualityFlags) as readonly BriefingQualityFlag[];
  const isSingleSource =
    sourceMix.length === 1 ||
    (sourceMix.length > 0 &&
      sourceMix.every((source) => source.singleSourceOnly));
  const warnings = compactUnique([
    flags.includes('partial_evidence')
      ? 'Only partial evidence was available for this briefing.'
      : undefined,
    flags.includes('context_unavailable')
      ? 'Additional context was unavailable during generation.'
      : undefined,
    flags.includes('provider_failed')
      ? 'At least one source provider failed during generation.'
      : undefined,
    flags.includes('limited_sources') || isSingleSource
      ? 'Source coverage is limited or single-source.'
      : undefined,
    flags.includes('low_confidence')
      ? 'The model marked this briefing as low confidence.'
      : undefined,
    flags.includes('conflicting_evidence')
      ? 'Some cited evidence conflicts across sources.'
      : undefined,
  ]);

  return {
    status: qualityStatus(flags, isSingleSource),
    flags,
    warnings,
    isSingleSource,
  };
};

const sourceMixCount = (
  counts: Map<
    string,
    {
      itemIds: Set<string>;
      citationIds: Set<string>;
      storyClusterIds: Set<string>;
      crossSourceClusterIds: Set<string>;
      topicIds: Set<string>;
    }
  >,
  providerKey: string,
) => {
  const current = counts.get(providerKey) ?? {
    itemIds: new Set<string>(),
    citationIds: new Set<string>(),
    storyClusterIds: new Set<string>(),
    crossSourceClusterIds: new Set<string>(),
    topicIds: new Set<string>(),
  };
  counts.set(providerKey, current);

  return current;
};

const qualityStatus = (
  flags: readonly BriefingQualityFlag[],
  isSingleSource: boolean,
): BriefingReaderQualityState['status'] => {
  if (flags.includes('no_signal')) {
    return 'no_signal';
  }
  if (flags.includes('provider_failed')) {
    return 'failed_provider';
  }
  if (
    flags.includes('partial_evidence') ||
    flags.includes('context_unavailable')
  ) {
    return 'partial';
  }
  if (flags.includes('low_confidence')) {
    return 'low_confidence';
  }
  if (flags.includes('limited_sources') || isSingleSource) {
    return 'limited_sources';
  }

  return 'ready';
};
