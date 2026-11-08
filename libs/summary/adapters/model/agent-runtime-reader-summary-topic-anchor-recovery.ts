import type { ReaderSummaryTopicLabelerInput } from "../../ports";
import { meaningfulTopicLabelTokens } from "../../domain/services/reader-summary-topic-map-label-quality";
import {
  formatReaderSummaryTopicToken,
  normalizeTopicLabel,
} from "../../domain/services/reader-summary-topic-map-text";

export const recoverSemanticGroupAnchors = (params: {
  readonly groupId: string;
  readonly nodeLabels: readonly {
    readonly nodeId: string;
    readonly label?: string;
    readonly groupId?: string;
    readonly keywords?: readonly string[];
  }[];
  readonly candidates: readonly ReaderSummaryTopicLabelerInput["candidates"][number][];
}): readonly string[] => {
  const candidateByNodeId = new Map(
    params.candidates.map(
      (candidate) => [candidate.nodeId, candidate] as const,
    ),
  );
  const support = new Map<
    string,
    { readonly display: string; count: number }
  >();

  for (const nodeLabel of params.nodeLabels.filter(
    (label) => label.groupId === params.groupId,
  )) {
    const candidate = candidateByNodeId.get(nodeLabel.nodeId);
    const nodeAnchors = new Map<string, string>();
    for (const value of [
      nodeLabel.label,
      ...(nodeLabel.keywords ?? []),
      candidate?.fallbackLabel,
      ...(candidate?.keywords ?? []),
      ...(candidate?.labelCandidates.map((item) => item.label) ?? []),
    ]) {
      if (value === undefined) {
        continue;
      }
      for (const anchor of recoverableSemanticAnchors(value)) {
        nodeAnchors.set(normalizeTopicLabel(anchor), anchor);
      }
    }
    for (const [key, display] of nodeAnchors) {
      const current = support.get(key);
      support.set(key, {
        display: current?.display ?? display,
        count: (current?.count ?? 0) + 1,
      });
    }
  }

  return [...support.entries()]
    .filter(([, value]) => value.count >= 2)
    .sort((left, right) => {
      const byCount = right[1].count - left[1].count;

      return byCount !== 0 ? byCount : left[0].localeCompare(right[0]);
    })
    .map(([, value]) => value.display)
    .slice(0, 8);
};

const recoverableSemanticAnchors = (value: string): readonly string[] => {
  const normalized = normalizeTopicLabel(value);
  const tokens = meaningfulTopicLabelTokens(value).filter(
    (token) => !recoveryNoiseTokens.has(token),
  );
  const phrase =
    tokens.length >= 2 && tokens.length <= 3 ? normalized : undefined;

  return uniqueStrings([phrase, ...tokens.map(formatReaderSummaryTopicToken)]);
};

const recoveryNoiseTokens = new Set([
  "com",
  "http",
  "https",
  "item",
  "reddit",
  "status",
  "topic",
  "twitter",
  "url",
  "ycombinator",
]);

export const uniqueStrings = (
  values: readonly (string | undefined)[],
): readonly string[] => [
  ...new Map(
    values
      .map((value) => value?.trim())
      .filter(
        (value): value is string => value !== undefined && value.length > 0,
      )
      .map((value) => [normalizeTopicLabel(value), value] as const),
  ).values(),
];
