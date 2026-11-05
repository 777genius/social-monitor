import {
  READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS,
  READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
  READER_SUMMARY_TOPIC_SEMANTIC_CONFIDENCE_MIN,
  readerSummaryTopicClaimTypes,
  renderReaderSummaryTopicSemanticLabel,
  type ReaderSummaryTopicClaimType,
  type ReaderSummaryTopicSemanticLabel,
  type ReaderSummaryTopicLabelPlan,
} from "../../domain";
import type { ReaderSummaryTopicLabelerInput } from "../../ports";
import { evaluateTopicLabelQuality, meaningfulTopicLabelTokens } from "../../domain/services/reader-summary-topic-map-label-quality";
import {
  formatReaderSummaryTopicToken,
  normalizeTopicLabel,
  readerSummaryTopicLabelFromSlug,
} from "../../domain/services/reader-summary-topic-map-text";
import { completeRequiredGroundedTopicCohorts } from "./agent-runtime-reader-summary-topic-cohort-completion";

export const normalizeAgentRuntimeReaderSummaryTopicLabelPlan = (
  raw: Record<string, unknown>,
  candidates: readonly ReaderSummaryTopicLabelerInput["candidates"][number][],
): ReaderSummaryTopicLabelPlan => {
  const knownNodeIds = new Set(candidates.map((candidate) => candidate.nodeId));
  const candidateByNodeId = new Map(
    candidates.map((candidate) => [candidate.nodeId, candidate] as const),
  );
  const parsedNodeLabels = readRecordArray(raw.nodeLabels)
    .map((label) => {
      const nodeId = stringValue(label.nodeId);
      const semantic = semanticLabelFromRaw(
        label,
        candidateByNodeId.get(nodeId)?.fallbackLabel,
      );

      return {
        nodeId,
        topicId: optionalString(label.topicId),
        label: renderReaderSummaryTopicSemanticLabel(semantic),
        semantic,
        rawGroupId: optionalString(label.groupId),
        groupId: normalizeSemanticGroupId(optionalString(label.groupId)),
        keywords: readStringArray(label.keywords).slice(0, 8),
        rationale: optionalString(label.rationale),
      };
    })
    .filter((label) => knownNodeIds.has(label.nodeId));
  const returnedNodeIds = new Set(
    parsedNodeLabels.map((label) => label.nodeId),
  );
  if (
    returnedNodeIds.size !== parsedNodeLabels.length ||
    [...knownNodeIds].some((nodeId) => !returnedNodeIds.has(nodeId))
  ) {
    throw new Error(
      "Reader summary topic map response must label every requested node exactly once",
    );
  }
  const retainedGroupIds = retainedSemanticGroupIds(
    parsedNodeLabels,
    candidates,
  );
  const initialNodeLabels = parsedNodeLabels.map((label) => ({
    nodeId: label.nodeId,
    topicId: label.topicId,
    label: label.label,
    semantic: label.semantic,
    originalGroupId: label.groupId,
    groupId:
      retainedGroupIds.has(label.groupId) &&
      label.semantic.confidenceScore >=
        READER_SUMMARY_TOPIC_SEMANTIC_CONFIDENCE_MIN
        ? label.groupId
        : READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
    keywords: label.keywords,
    rationale: label.rationale,
  }));
  const groupRecords = new Map<string, Record<string, unknown>>();
  for (const group of readRecordArray(raw.groups)) {
    const id = normalizeSemanticGroupId(optionalString(group.id));
    if (id !== READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID && !groupRecords.has(id)) {
      groupRecords.set(id, group);
    }
  }
  const recovery = completeRequiredGroundedTopicCohorts(
    initialNodeLabels,
    candidates,
    new Map(parsedNodeLabels.map((label) => [label.nodeId, label.groupId])),
  );
  const nodeLabels = recovery.nodeLabels;
  const finalGroupIds = new Set(
    nodeLabels
      .map((label) => label.groupId)
      .filter(
        (groupId): groupId is string =>
          groupId !== undefined &&
          groupId !== READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
      ),
  );
  const groups = [...finalGroupIds].map((id) => {
    const group = groupRecords.get(id);
    const proposedLabel = group === undefined
      ? semanticGroupLabelFromId(id) : stringValue(group.label);
    const explicitAnchors =
      group === undefined ? [] : readStringArray(group.semanticAnchors);
    const recoveredAnchors = recoverSemanticGroupAnchors({
      groupId: id,
      nodeLabels,
      candidates,
    });

    return {
      id,
      label: evaluateTopicLabelQuality(proposedLabel).accepted
        ? proposedLabel : recovery.displayByGroup.get(id) ?? proposedLabel,
      recoveredDisplayLabel: recovery.displayByGroup.get(id),
      semanticAnchors: uniqueStrings([
        ...explicitAnchors,
        ...(recovery.semanticAnchorsByGroup.get(id) ?? []),
        ...recoveredAnchors,
        semanticGroupLabelFromId(id),
      ]).slice(0, 8),
      nodeIds: nodeLabels
        .filter((label) => label.groupId === id)
        .map((label) => label.nodeId),
      confidenceScore:
        group === undefined ? 0.5 : numberValue(group.confidenceScore),
      rationale:
        group === undefined
          ? "Recovered from consistent node group assignments"
          : optionalString(group.rationale),
    };
  });
  const recoveredGroupCount = [...finalGroupIds].filter(
    (groupId) => !groupRecords.has(groupId),
  ).length;
  const recoveredAnchorGroupCount = groups.filter((group) => {
    const explicit = readStringArray(
      groupRecords.get(group.id)?.semanticAnchors,
    );

    return explicit.length < 2 && group.semanticAnchors.length >= 2;
  }).length;
  const normalizedAwayCount = nodeLabels.filter(
    (label) =>
      label.groupId === READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID &&
      parsedNodeLabels.find((candidate) => candidate.nodeId === label.nodeId)
        ?.rawGroupId !== READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
  ).length;
  const lowConfidenceCount = parsedNodeLabels.filter(
    (label) =>
      label.semantic.confidenceScore <
      READER_SUMMARY_TOPIC_SEMANTIC_CONFIDENCE_MIN,
  ).length;

  return {
    nodeLabels,
    groups,
    warnings: [
      ...readStringArray(raw.warnings),
      ...(lowConfidenceCount > 0
        ? [
            `${lowConfidenceCount} low-confidence topic assignments were kept ungrouped`,
          ]
        : []),
      ...(normalizedAwayCount > 0
        ? [
            `${normalizedAwayCount} topic assignments exceeded the semantic group contract and were marked ungrouped`,
          ]
        : []),
      ...(recoveredGroupCount > 0
        ? [
            `${recoveredGroupCount} semantic group definitions were recovered from canonical node assignments`,
          ]
        : []),
      ...(recoveredAnchorGroupCount > 0
        ? [
            `${recoveredAnchorGroupCount} semantic group anchor sets were recovered from shared node evidence`,
          ]
        : []),
      ...(recovery.recoveredNodeCount > 0
        ? [
            `${recovery.recoveredNodeCount} ungrouped topic assignments were recovered from shared grounded anchors`,
          ]
        : []),
    ],
  };
};

export const parseAgentRuntimeReaderSummaryTopicLabelerJsonObject = (
  value: string,
): Record<string, unknown> => {
  const parsed = JSON.parse(value);

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Reader summary topic map response must be a JSON object");
  }

  return parsed as Record<string, unknown>;
};

const normalizeSemanticGroupId = (value: string | undefined): string =>
  value !== undefined &&
  /^group:[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value) &&
  value !== READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID
    ? value
    : READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID;

const semanticGroupLabelFromId = (groupId: string): string => {
  const [, rawValue = groupId] = groupId.split(":");

  return readerSummaryTopicLabelFromSlug(rawValue ?? "other-topics");
};

const retainedSemanticGroupIds = (
  nodeLabels: readonly { readonly nodeId: string; readonly groupId: string }[],
  candidates: readonly ReaderSummaryTopicLabelerInput["candidates"][number][],
): ReadonlySet<string> => {
  const candidateScoreById = new Map(
    candidates.map((candidate) => [candidate.nodeId, candidate.score] as const),
  );
  const stats = new Map<string, { count: number; score: number }>();
  for (const label of nodeLabels) {
    if (label.groupId === READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID) {
      continue;
    }
    const current = stats.get(label.groupId) ?? { count: 0, score: 0 };
    stats.set(label.groupId, {
      count: current.count + 1,
      score: current.score + (candidateScoreById.get(label.nodeId) ?? 0),
    });
  }

  return new Set(
    [...stats.entries()]
      .filter(([, stats]) => stats.count >= 2)
      .sort((left, right) => {
        const byCount = right[1].count - left[1].count;
        if (byCount !== 0) {
          return byCount;
        }
        const byScore = right[1].score - left[1].score;

        return byScore !== 0 ? byScore : left[0].localeCompare(right[0]);
      })
      .slice(0, READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS)
      .map(([groupId]) => groupId),
  );
};

const readRecordArray = (value: unknown): readonly Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === "object" && !Array.isArray(item),
      )
    : [];

const readStringArray = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : [];

const stringValue = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const optionalString = (value: unknown): string | undefined => {
  const text = stringValue(value);

  return text.length > 0 ? text : undefined;
};

const numberValue = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const semanticLabelFromRaw = (
  value: Record<string, unknown>,
  fallbackSubject: string | undefined,
): ReaderSummaryTopicSemanticLabel => ({
  subject: optionalString(value.subject) ?? fallbackSubject ?? "Topic",
  parentSubject: optionalString(value.parentSubject),
  claimType: claimTypeValue(value.claimType),
  qualifier: optionalString(value.qualifier),
  confidenceScore: Math.min(
    1,
    Math.max(0, numberValue(value.confidenceScore) ?? 0),
  ),
});

const claimTypeValue = (value: unknown): ReaderSummaryTopicClaimType => {
  const candidate = optionalString(value);

  return readerSummaryTopicClaimTypes.includes(
    candidate as ReaderSummaryTopicClaimType,
  )
    ? (candidate as ReaderSummaryTopicClaimType)
    : "other";
};

const recoverSemanticGroupAnchors = (params: {
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

const uniqueStrings = (
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
