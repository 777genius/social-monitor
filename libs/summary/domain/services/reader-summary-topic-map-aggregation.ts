import type { ReaderSummaryTopicMapNode } from "../entities/reader-summary-topic-map";
import { uniqueNonEmpty } from "../value-objects/summary-text";
import type { ReaderSummaryTopicNodeLabel } from "./reader-summary-topic-label-plan";
import {
  compactId,
  compactOptional,
  normalizeTopicLabel,
  slug,
} from "./reader-summary-topic-map-text";

export type ReaderSummaryTopicMapNodeDraft = ReaderSummaryTopicMapNode & {
  readonly aggregateKey: string;
  readonly aggregateLabel?: string;
  readonly aggregateRankScore: number;
};

export const aggregateReaderSummaryTopicMapNodes = (
  drafts: readonly ReaderSummaryTopicMapNodeDraft[],
): readonly ReaderSummaryTopicMapNode[] => {
  const byTopic = new Map<string, ReaderSummaryTopicMapNodeDraft[]>();

  for (const draft of drafts) {
    byTopic.set(draft.aggregateKey, [
      ...(byTopic.get(draft.aggregateKey) ?? []),
      draft,
    ]);
  }

  return [...byTopic.values()].map((topicDrafts) => {
    const rankedDrafts = topicDrafts
      .slice()
      .sort((left, right) => right.aggregateRankScore - left.aggregateRankScore);
    const lead = rankedDrafts[0];
    if (lead === undefined) {
      throw new Error("Reader summary topic aggregate is empty");
    }
    if (rankedDrafts.length === 1) {
      return toPublicTopicNode(lead);
    }

    const evidenceCount = rankedDrafts.reduce(
      (total, draft) => total + draft.evidenceCount,
      0,
    );
    const storyClusterIds = uniqueNonEmpty(
      rankedDrafts.flatMap((draft) => draft.storyClusterIds),
    );

    return {
      id: aggregateTopicNodeId(lead.aggregateKey),
      label: lead.aggregateLabel ?? lead.label,
      groupId: lead.groupId,
      storyClusterIds,
      popularityScore: rankedDrafts.reduce(
        (total, draft) => total + Math.max(0, draft.aggregateRankScore),
        0,
      ),
      sizeWeight: lead.sizeWeight,
      evidenceCount,
      providerKeys: uniqueNonEmpty(
        rankedDrafts.flatMap((draft) => draft.providerKeys),
      ),
      interestIds: uniqueNonEmpty(
        rankedDrafts.flatMap((draft) => draft.interestIds),
      ),
      citationIds: uniqueNonEmpty(
        rankedDrafts.flatMap((draft) => draft.citationIds),
      ),
      keywords: uniqueNonEmpty(
        rankedDrafts.flatMap((draft) => draft.keywords),
      ).slice(0, 8),
      rationale: `Aggregates ${storyClusterIds.length} story clusters and ${evidenceCount} source items`,
    };
  });
};

export const readerSummaryTopicMapAggregateKey = (params: {
  readonly nodeId: string;
  readonly nodeLabel?: ReaderSummaryTopicNodeLabel;
  readonly fallbackGroupId?: string;
  readonly aggregateFallbackGroup?: boolean;
}): string => {
  const topicId = compactId(params.nodeLabel?.topicId);
  if (topicId !== undefined) {
    return `llm-topic:${slug(topicId)}`;
  }

  const label = compactOptional(params.nodeLabel?.label);
  const groupId = compactId(params.nodeLabel?.groupId);
  if (label !== undefined && groupId !== undefined) {
    return `llm-label:${slug(groupId)}:${slug(normalizeTopicLabel(label))}`;
  }
  const fallbackGroupId = compactId(params.fallbackGroupId);
  if (params.aggregateFallbackGroup === true && fallbackGroupId !== undefined) {
    return `fallback-group:${slug(fallbackGroupId)}`;
  }

  return `node:${params.nodeId}`;
};

const aggregateTopicNodeId = (aggregateKey: string): string =>
  `topic:aggregate:${slug(aggregateKey)}`;

const toPublicTopicNode = (
  draft: ReaderSummaryTopicMapNodeDraft,
): ReaderSummaryTopicMapNode => ({
  id: draft.id,
  label: singleTopicNodeLabel(draft),
  groupId: draft.groupId,
  storyClusterIds: draft.storyClusterIds,
  popularityScore: draft.popularityScore,
  sizeWeight: draft.sizeWeight,
  evidenceCount: draft.evidenceCount,
  providerKeys: draft.providerKeys,
  interestIds: draft.interestIds,
  citationIds: draft.citationIds,
  keywords: draft.keywords,
  rationale: draft.rationale,
});

const singleTopicNodeLabel = (draft: ReaderSummaryTopicMapNodeDraft): string => {
  if (draft.aggregateLabel === undefined) {
    return draft.label;
  }

  const aggregateTokens = topicLabelTokens(draft.aggregateLabel);
  const labelTokens = topicLabelTokens(draft.label);
  const labelAddsSpecificContext =
    labelTokens.length >= 2 &&
    labelTokens.length <= 4 &&
    aggregateTokens.length > 0 &&
    aggregateTokens.every((token) => labelTokens.includes(token)) &&
    labelTokens.length > aggregateTokens.length;

  return labelAddsSpecificContext ? draft.label : draft.aggregateLabel;
};

const topicLabelTokens = (value: string): readonly string[] =>
  normalizeTopicLabel(value).split(/\s+/u).filter(Boolean);
