import type {
  ReaderSummaryTopicLabelPlan,
  ReaderSummaryTopicNodeLabel,
} from "./reader-summary-topic-label-plan";
import type { ReaderSummaryTopicRelationCandidate } from "./reader-summary-topic-relation-candidates";

export const READER_SUMMARY_TOPIC_RELATION_CONFIDENCE_MIN = 0.82;

export type ReaderSummaryTopicRelationDecision = {
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly sameTopic: boolean;
  readonly confidenceScore: number;
  readonly rationale?: string;
};

export const reconcileVerifiedReaderSummaryTopicRelations = (params: {
  readonly labelPlan: ReaderSummaryTopicLabelPlan;
  readonly candidates: readonly ReaderSummaryTopicRelationCandidate[];
  readonly decisions: readonly ReaderSummaryTopicRelationDecision[];
  readonly verificationWarning?: string;
}): ReaderSummaryTopicLabelPlan => {
  const labelByNodeId = new Map(
    params.labelPlan.nodeLabels.map((label) => [label.nodeId, label] as const),
  );
  const allowedPairs = new Set(params.candidates.map(relationPairKey));
  const parentByNodeId = new Map(
    params.labelPlan.nodeLabels.map((label) => [label.nodeId, label.nodeId]),
  );
  let acceptedPairCount = 0;
  const rejectedPairs = params.decisions.filter((decision) =>
    decision.sameTopic === false && validDecision(decision, allowedPairs, labelByNodeId),
  );

  for (const decision of params.decisions) {
    if (
      !decision.sameTopic ||
      !validDecision(decision, allowedPairs, labelByNodeId)
    ) {
      continue;
    }
    const source = labelByNodeId.get(decision.sourceNodeId);
    const target = labelByNodeId.get(decision.targetNodeId);
    if (!labelsCanShareVerifiedTopic(source, target)) {
      continue;
    }
    const rootsToMerge = new Set([
      findRoot(parentByNodeId, decision.sourceNodeId),
      findRoot(parentByNodeId, decision.targetNodeId),
    ]);
    if (rejectedPairs.some((pair) =>
      rootsToMerge.has(findRoot(parentByNodeId, pair.sourceNodeId)) &&
      rootsToMerge.has(findRoot(parentByNodeId, pair.targetNodeId)),
    )) {
      continue;
    }
    union(parentByNodeId, decision.sourceNodeId, decision.targetNodeId);
    acceptedPairCount += 1;
  }

  const verificationWarning =
    params.verificationWarning ??
    `${params.decisions.length} topic relations were reviewed and ${acceptedPairCount} were verified by focused semantic review`;
  const membersByRoot = new Map<string, ReaderSummaryTopicNodeLabel[]>();
  for (const label of params.labelPlan.nodeLabels) {
    const root = findRoot(parentByNodeId, label.nodeId);
    membersByRoot.set(root, [...(membersByRoot.get(root) ?? []), label]);
  }
  const rootsByTopicId = new Map<string, Set<string>>();
  for (const [root, members] of membersByRoot) {
    for (const label of members) {
      if (label.topicId !== undefined) {
        const roots = rootsByTopicId.get(label.topicId) ?? new Set<string>();
        roots.add(root);
        rootsByTopicId.set(label.topicId, roots);
      }
    }
  }
  const topicIdByNodeId = new Map<string, string>();
  const canonicalNodeIdByNodeId = new Map<string, string>();
  for (const members of membersByRoot.values()) {
    const ranked = members.slice().sort(compareCanonicalLabels);
    members.forEach((label) => canonicalNodeIdByNodeId.set(label.nodeId, ranked[0]!.nodeId));
    if (ranked.length === 1) {
      const singleton = ranked[0]!;
      if (
        singleton.topicId !== undefined &&
        (rootsByTopicId.get(singleton.topicId)?.size ?? 0) > 1
      ) {
        topicIdByNodeId.set(
          singleton.nodeId,
          `topic:verified-single-${encodeURIComponent(singleton.nodeId)}`,
        );
      }
      continue;
    }
    const canonical = ranked.find((label) => label.topicId !== undefined);
    const topicId =
      canonical?.topicId !== undefined &&
      rootsByTopicId.get(canonical.topicId)?.size === 1
        ? canonical.topicId
        : `topic:verified-${encodeURIComponent(ranked[0]!.nodeId)}`;
    members.forEach((label) => topicIdByNodeId.set(label.nodeId, topicId));
  }

  return {
    ...params.labelPlan,
    nodeLabels: params.labelPlan.nodeLabels.map((label) => ({
      ...label,
      topicId: topicIdByNodeId.get(label.nodeId) ?? label.topicId,
      relationIdentity: {
        source: "topic-relation-reconciliation",
        canonicalNodeId: canonicalNodeIdByNodeId.get(label.nodeId)!,
      },
    })),
    warnings: [...(params.labelPlan.warnings ?? []), verificationWarning],
  };
};

const validDecision = (
  decision: ReaderSummaryTopicRelationDecision,
  allowedPairs: ReadonlySet<string>,
  labels: ReadonlyMap<string, ReaderSummaryTopicNodeLabel>,
): boolean =>
  Number.isFinite(decision.confidenceScore) &&
  decision.confidenceScore >= READER_SUMMARY_TOPIC_RELATION_CONFIDENCE_MIN &&
  decision.confidenceScore <= 1 &&
  decision.sourceNodeId !== decision.targetNodeId &&
  labels.has(decision.sourceNodeId) && labels.has(decision.targetNodeId) &&
  allowedPairs.has(relationPairKey(decision));

const labelsCanShareVerifiedTopic = (
  source: ReaderSummaryTopicNodeLabel | undefined,
  target: ReaderSummaryTopicNodeLabel | undefined,
): boolean => {
  if (source?.semantic === undefined || target?.semantic === undefined) {
    return false;
  }
  if (source.semantic.claimType !== target.semantic.claimType) {
    return false;
  }
  const sourceParent = normalizedParent(source);
  const targetParent = normalizedParent(target);

  return (
    sourceParent.length === 0 ||
    targetParent.length === 0 ||
    sourceParent === targetParent
  );
};

const normalizedParent = (label: ReaderSummaryTopicNodeLabel): string =>
  label.semantic?.parentSubject?.trim().toLocaleLowerCase("en-US") ?? "";

const compareCanonicalLabels = (
  left: ReaderSummaryTopicNodeLabel,
  right: ReaderSummaryTopicNodeLabel,
): number =>
  (right.semantic?.confidenceScore ?? 0) -
    (left.semantic?.confidenceScore ?? 0) ||
  left.nodeId.localeCompare(right.nodeId);

const relationPairKey = (pair: {
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
}): string => [pair.sourceNodeId, pair.targetNodeId].sort().join("\u0000");

const findRoot = (parents: Map<string, string>, nodeId: string): string => {
  const parent = parents.get(nodeId) ?? nodeId;
  if (parent === nodeId) {
    return nodeId;
  }
  const root = findRoot(parents, parent);
  parents.set(nodeId, root);

  return root;
};

const union = (
  parents: Map<string, string>,
  sourceNodeId: string,
  targetNodeId: string,
): void => {
  const sourceRoot = findRoot(parents, sourceNodeId);
  const targetRoot = findRoot(parents, targetNodeId);
  if (sourceRoot !== targetRoot) {
    parents.set(targetRoot, sourceRoot);
  }
};
