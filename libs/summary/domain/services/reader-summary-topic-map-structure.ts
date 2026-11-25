import {
  READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
  type ReaderSummaryTopicMap,
  type ReaderSummaryTopicMapGenerator,
  type ReaderSummaryTopicMapGroup,
  type ReaderSummaryTopicMapNode,
} from "../entities/reader-summary-topic-map";
import { readerSummaryIndependentProviderFamilyCount } from
  "../value-objects/reader-summary-provider-identity";
import {
  isReaderSummaryTopicMapUngrouped,
  supportedReaderSummaryTopicMapGroupAnchors,
} from "../policies/reader-summary-topic-map-grouping-policy";
import type { ReaderSummaryTopicGroupLabel } from "./reader-summary-topic-label-plan";
import {
  evaluateTopicLabelQuality,
  isWeakTopicLabel,
  meaningfulTopicLabelTokens,
} from "./reader-summary-topic-map-label-quality";
import {
  compactLabel,
  compactOptional,
  humanizeSlug,
  readerSummaryTopicLabelFromSlug,
} from "./reader-summary-topic-map-text";

const colorKeys = [
  "blue",
  "green",
  "pink",
  "amber",
  "violet",
  "teal",
  "orange",
  "slate",
] as const;

export const buildReaderSummaryTopicMapGroups = (
  nodes: readonly ReaderSummaryTopicMapNode[],
  labelGroups: ReadonlyMap<string, ReaderSummaryTopicGroupLabel>,
): readonly ReaderSummaryTopicMapGroup[] => {
  const byGroup = new Map<string, ReaderSummaryTopicMapNode[]>();
  for (const node of nodes) {
    byGroup.set(node.groupId, [...(byGroup.get(node.groupId) ?? []), node]);
  }

  return [...byGroup.entries()]
    .map(([groupId, groupNodes], index) => {
      const labeled = labelGroups.get(groupId);
      const ungrouped = isReaderSummaryTopicMapUngrouped(groupId);
      const semanticAnchors = ungrouped
        ? []
        : supportedReaderSummaryTopicMapGroupAnchors(nodes, groupId, [
            labeled?.label ?? humanizeSlug(groupId.split(":")[1] ?? groupId),
            ...(labeled?.semanticAnchors ?? []),
          ]);

      return {
        id: groupId,
        label: topicGroupLabel(groupId, groupNodes, labeled),
        colorKey: ungrouped
          ? "slate"
          : (colorKeys[index % colorKeys.length] ?? "blue"),
        semanticAnchors,
        nodeIds: groupNodes.map((node) => node.id),
        confidence: {
          level: ungrouped ? "low" : labeled === undefined ? "medium" : "high",
          score: boundedScore(
            ungrouped ? 0.35 : (labeled?.confidenceScore ?? 0.72),
          ),
          rationale:
            (ungrouped
              ? "Contains topics without enough evidence for a semantic group"
              : compactOptional(labeled?.rationale)) ??
            `Groups ${groupNodes.length} related topic nodes`,
        },
      } satisfies ReaderSummaryTopicMapGroup;
    })
    .sort((left, right) => right.nodeIds.length - left.nodeIds.length);
};

export const readerSummaryTopicMapConfidence = (
  nodes: readonly ReaderSummaryTopicMapNode[],
  groups: readonly ReaderSummaryTopicMapGroup[],
  generatedBy: ReaderSummaryTopicMapGenerator | undefined,
): ReaderSummaryTopicMap["confidence"] => {
  const crossSourceNodeCount = nodes.filter(
    (node) =>
      readerSummaryIndependentProviderFamilyCount(node.providerKeys) > 1,
  ).length;
  const groupedNodeCount = nodes.filter(
    (node) => !isReaderSummaryTopicMapUngrouped(node.groupId),
  ).length;
  const groupedCoverage =
    nodes.length === 0 ? 0 : groupedNodeCount / nodes.length;
  const crossSourceCoverage =
    nodes.length === 0 ? 0 : crossSourceNodeCount / nodes.length;
  const semanticGroupCount = groups.filter(
    (group) => group.id !== READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
  ).length;
  const score = boundedScore(
    0.25 +
      Math.min(0.15, nodes.length * 0.01) +
      Math.min(0.2, crossSourceCoverage * 0.5) +
      Math.min(0.3, groupedCoverage * 0.3) +
      (generatedBy === "agent-runtime" ? 0.1 : 0),
  );

  return {
    level: score >= 0.78 ? "high" : score >= 0.55 ? "medium" : "low",
    score,
    rationale: `Built from ${nodes.length} topic nodes; ${groupedNodeCount} belong to ${semanticGroupCount} supported semantic groups`,
  };
};

const topicGroupLabel = (
  groupId: string,
  nodes: readonly ReaderSummaryTopicMapNode[],
  proposed: ReaderSummaryTopicGroupLabel | undefined,
): string => {
  const fallback = deterministicGroupLabel(groupId);
  if (isReaderSummaryTopicMapUngrouped(groupId)) {
    return fallback;
  }
  const evidenceTexts = nodes.flatMap((node) => [node.label, ...node.keywords]);
  const [, rawValue = groupId] = groupId.split(":");
  const groupTokens = new Set(
    meaningfulTopicLabelTokens(humanizeSlug(rawValue)),
  );
  for (const display of [proposed?.label, proposed?.recoveredDisplayLabel].map(compactOptional)) {
    if (display === undefined) continue;
    const quality = evaluateTopicLabelQuality(display, { evidenceTexts });
    if (quality.accepted && quality.meaningfulTokens.some((token) => groupTokens.has(token))) {
      return quality.label;
    }
  }
  return fallback;
};

const deterministicGroupLabel = (groupId: string): string => {
  if (isReaderSummaryTopicMapUngrouped(groupId)) {
    return "Ungrouped";
  }
  const [, rawValue = groupId] = groupId.split(":");
  const fallbackLabel = compactLabel(readerSummaryTopicLabelFromSlug(rawValue));

  return isWeakTopicLabel(fallbackLabel) ? "Other topics" : fallbackLabel;
};

const boundedScore = (value: number): number =>
  roundScore(Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

const roundScore = (value: number): number => Math.round(value * 1000) / 1000;
