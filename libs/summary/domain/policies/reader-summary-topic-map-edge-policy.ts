import type {
  ReaderSummaryTopicMap,
  ReaderSummaryTopicMapGroup,
  ReaderSummaryTopicMapNode,
} from "../entities/reader-summary-topic-map";
import { meaningfulTopicLabelTokens } from "../services/reader-summary-topic-map-label-quality";
import { normalizeTopicLabel } from "../services/reader-summary-topic-map-text";
import { isReaderSummaryTopicMapUngrouped } from "./reader-summary-topic-map-grouping-policy";

const maxEdges = 80;
const maxEdgesPerNode = 2;
const dominantTokenRatio = 0.55;

type TopicMapEdgeCandidate = ReaderSummaryTopicMap["edges"][number] & {
  readonly specificity: number;
  readonly popularity: number;
};

export const buildReaderSummaryTopicMapEdges = (
  nodes: readonly ReaderSummaryTopicMapNode[],
  groups: readonly ReaderSummaryTopicMapGroup[],
): ReaderSummaryTopicMap["edges"] => {
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const nodesByGroup = groupTopicMapNodes(nodes);
  const candidates = [...nodesByGroup.entries()].flatMap(
    ([groupId, groupNodes]) =>
      isReaderSummaryTopicMapUngrouped(groupId)
        ? []
        : edgeCandidatesForGroup(groupNodes, groupsById.get(groupId)),
  );
  const selected: TopicMapEdgeCandidate[] = [];
  const degreeByNodeId = new Map<string, number>();

  for (const candidate of candidates.sort(compareEdgeCandidates)) {
    const sourceDegree = degreeByNodeId.get(candidate.sourceNodeId) ?? 0;
    const targetDegree = degreeByNodeId.get(candidate.targetNodeId) ?? 0;
    if (sourceDegree >= maxEdgesPerNode || targetDegree >= maxEdgesPerNode) {
      continue;
    }
    selected.push(candidate);
    degreeByNodeId.set(candidate.sourceNodeId, sourceDegree + 1);
    degreeByNodeId.set(candidate.targetNodeId, targetDegree + 1);
    if (selected.length >= maxEdges) {
      break;
    }
  }

  return selected.map((edge) => ({
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    weight: edge.weight,
    reason: edge.reason,
  }));
};

const edgeCandidatesForGroup = (
  nodes: readonly ReaderSummaryTopicMapNode[],
  group: ReaderSummaryTopicMapGroup | undefined,
): readonly TopicMapEdgeCandidate[] => {
  const tokensByNodeId = new Map(
    nodes.map((node) => [node.id, topicEdgeTokens(node)]),
  );
  const tokenFrequency = topicTokenFrequency(tokensByNodeId.values());
  const excludedTokens = new Set([
    ...genericEdgeTokens,
    ...groupIdentityTokens(group),
    ...(nodes.length < 4
      ? []
      : [...tokenFrequency]
          .filter(([, count]) => count / nodes.length > dominantTokenRatio)
          .map(([token]) => token)),
  ]);

  return nodes.flatMap((source, sourceIndex) =>
    nodes.slice(sourceIndex + 1).flatMap((target) => {
      const sharedTokens = sharedTopicTokens(
        tokensByNodeId.get(source.id) ?? new Set(),
        tokensByNodeId.get(target.id) ?? new Set(),
        excludedTokens,
      );
      if (sharedTokens.length === 0) {
        return [];
      }
      const specificity = sharedTokens.reduce(
        (total, token) =>
          total + nodes.length / (tokenFrequency.get(token) ?? nodes.length),
        0,
      );

      return [
        {
          sourceNodeId: source.id,
          targetNodeId: target.id,
          weight: roundScore(0.55 + Math.min(0.4, specificity * 0.1)),
          reason: `Shared topic evidence: ${sharedTokens
            .slice(0, 2)
            .map(humanizeEdgeToken)
            .join(", ")}`,
          specificity,
          popularity: Math.min(source.popularityScore, target.popularityScore),
        },
      ];
    }),
  );
};

const groupTopicMapNodes = (
  nodes: readonly ReaderSummaryTopicMapNode[],
): ReadonlyMap<string, readonly ReaderSummaryTopicMapNode[]> => {
  const result = new Map<string, ReaderSummaryTopicMapNode[]>();
  for (const node of nodes) {
    result.set(node.groupId, [...(result.get(node.groupId) ?? []), node]);
  }

  return result;
};

const topicEdgeTokens = (
  node: ReaderSummaryTopicMapNode,
): ReadonlySet<string> =>
  new Set(
    [node.label].flatMap((value) => [
      ...meaningfulTopicLabelTokens(value).map(topicTokenFamily),
      ...modelVersionTokens(value),
    ]),
  );

const topicTokenFrequency = (
  tokenSets: Iterable<ReadonlySet<string>>,
): ReadonlyMap<string, number> => {
  const result = new Map<string, number>();
  for (const tokens of tokenSets) {
    for (const token of tokens) {
      result.set(token, (result.get(token) ?? 0) + 1);
    }
  }

  return result;
};

const groupIdentityTokens = (
  group: ReaderSummaryTopicMapGroup | undefined,
): readonly string[] => {
  if (group === undefined) {
    return [];
  }
  const [, rawGroupId = group.id] = group.id.split(":");

  return [group.label, rawGroupId].flatMap((value) =>
    meaningfulTopicLabelTokens(value).map(topicTokenFamily),
  );
};

const sharedTopicTokens = (
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
  excluded: ReadonlySet<string>,
): readonly string[] =>
  [...left].filter((token) => right.has(token) && !excluded.has(token)).sort();

const modelVersionTokens = (value: string): readonly string[] =>
  [...value.matchAll(modelVersionPattern)].flatMap((match) => {
    const family = match[1]?.toLocaleLowerCase("en-US");
    const version = match[2]?.toLocaleLowerCase("en-US");

    return family === undefined || version === undefined
      ? []
      : [`${family}-${version}`];
  });

const modelVersionPattern =
  /\b(gpt|claude|gemini|grok|llama|fable)\s*[-\u2010-\u2015\u2212 ]?\s*(\d+(?:\.\d+)+|\d+)\b/giu;

const topicTokenFamily = (token: string): string => {
  const normalized = normalizeTopicLabel(token);
  if (normalized.length > 4 && normalized.endsWith("ies")) {
    return `${normalized.slice(0, -3)}y`;
  }

  return normalized.length > 4 && normalized.endsWith("s")
    ? normalized.slice(0, -1)
    : normalized;
};

const compareEdgeCandidates = (
  left: TopicMapEdgeCandidate,
  right: TopicMapEdgeCandidate,
): number =>
  right.specificity - left.specificity ||
  right.popularity - left.popularity ||
  left.sourceNodeId.localeCompare(right.sourceNodeId) ||
  left.targetNodeId.localeCompare(right.targetNodeId);

const humanizeEdgeToken = (value: string): string =>
  value.replace(/[-_]+/gu, " ");

const genericEdgeTokens = new Set([
  "ai",
  "content",
  "developer",
  "ecosystem",
  "industry",
  "model",
  "product",
  "software",
  "technology",
  "tool",
  "url",
  "work",
]);

const roundScore = (value: number): number =>
  Math.round(Math.min(1, Math.max(0, value)) * 1000) / 1000;
