import { meaningfulTopicLabelTokens } from "./reader-summary-topic-map-label-quality";
import type { ReaderSummaryTopicNodeLabel } from "./reader-summary-topic-label-plan";

export type ReaderSummaryTopicRelationSource = {
  readonly nodeId: string;
  readonly fallbackLabel: string;
  readonly keywords: readonly string[];
  readonly labelCandidates: readonly { readonly label: string }[];
};

export type ReaderSummaryTopicRelationCandidate = {
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly sharedTerms: readonly string[];
};

export const READER_SUMMARY_TOPIC_RELATION_MAX_CANDIDATES = 24;

export const buildReaderSummaryTopicRelationCandidates = (
  candidates: readonly ReaderSummaryTopicRelationSource[],
  limit = READER_SUMMARY_TOPIC_RELATION_MAX_CANDIDATES,
): readonly ReaderSummaryTopicRelationCandidate[] => {
  const termsByNodeId = new Map(
    candidates.map((candidate) => [
      candidate.nodeId,
      candidateRelationshipTerms(candidate),
    ]),
  );
  const termSupport = new Map<string, number>();
  for (const terms of termsByNodeId.values()) {
    for (const term of terms) {
      termSupport.set(term, (termSupport.get(term) ?? 0) + 1);
    }
  }
  const pairs: (ReaderSummaryTopicRelationCandidate & {
    readonly score: number;
  })[] = [];

  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      const source = candidates[left]!;
      const target = candidates[right]!;
      const targetTerms = termsByNodeId.get(target.nodeId) ?? new Set();
      const sharedTerms = [...(termsByNodeId.get(source.nodeId) ?? [])]
        .filter((term) => targetTerms.has(term))
        .sort(
          (leftTerm, rightTerm) =>
            (termSupport.get(leftTerm) ?? candidates.length) -
              (termSupport.get(rightTerm) ?? candidates.length) ||
            leftTerm.localeCompare(rightTerm),
        );
      if (sharedTerms.length < 2) {
        continue;
      }
      pairs.push({
        sourceNodeId: source.nodeId,
        targetNodeId: target.nodeId,
        sharedTerms: sharedTerms.slice(0, 4),
        score: sharedTerms.reduce(
          (score, term) => score + 1 / (termSupport.get(term) ?? 1),
          sharedTerms.length,
        ),
      });
    }
  }

  return pairs
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.sourceNodeId.localeCompare(right.sourceNodeId) ||
        left.targetNodeId.localeCompare(right.targetNodeId),
    )
    .slice(0, Math.max(0, limit))
    .map(({ sourceNodeId, targetNodeId, sharedTerms }) => ({
      sourceNodeId,
      targetNodeId,
      sharedTerms,
    }));
};

export const buildExistingReaderSummaryTopicRelations = (
  candidates: readonly ReaderSummaryTopicRelationSource[],
  nodeLabels: readonly ReaderSummaryTopicNodeLabel[],
): readonly ReaderSummaryTopicRelationCandidate[] => {
  const candidateIds = new Set(candidates.map((candidate) => candidate.nodeId));
  const lexicalRelations = new Map(
    buildReaderSummaryTopicRelationCandidates(
      candidates,
      Number.MAX_SAFE_INTEGER,
    ).map((relation) => [relationPairKey(relation), relation] as const),
  );
  const labelsByTopicId = new Map<string, ReaderSummaryTopicNodeLabel[]>();
  for (const label of nodeLabels) {
    if (label.topicId === undefined || !candidateIds.has(label.nodeId)) {
      continue;
    }
    labelsByTopicId.set(label.topicId, [
      ...(labelsByTopicId.get(label.topicId) ?? []),
      label,
    ]);
  }
  const relations: ReaderSummaryTopicRelationCandidate[] = [];
  for (const labels of labelsByTopicId.values()) {
    for (let left = 0; left < labels.length; left += 1) {
      for (let right = left + 1; right < labels.length; right += 1) {
        const sourceNodeId = labels[left]!.nodeId;
        const targetNodeId = labels[right]!.nodeId;
        relations.push(
          lexicalRelations.get(
            relationPairKey({ sourceNodeId, targetNodeId }),
          ) ?? { sourceNodeId, targetNodeId, sharedTerms: [] },
        );
      }
    }
  }

  return relations;
};

export const buildSemanticallyEquivalentReaderSummaryTopicRelations = (
  candidates: readonly ReaderSummaryTopicRelationSource[],
  nodeLabels: readonly ReaderSummaryTopicNodeLabel[],
): readonly ReaderSummaryTopicRelationCandidate[] => {
  const candidateIds = new Set(candidates.map((candidate) => candidate.nodeId));
  const labelsBySemanticIdentity = new Map<
    string,
    ReaderSummaryTopicNodeLabel[]
  >();
  for (const label of nodeLabels) {
    if (!candidateIds.has(label.nodeId) || label.semantic === undefined) {
      continue;
    }
    const subjectTerms = meaningfulTopicLabelTokens(label.semantic.subject);
    if (subjectTerms.length === 0) {
      continue;
    }
    const identity = `${label.semantic.claimType}\u0000${subjectTerms.join(" ")}`;
    labelsBySemanticIdentity.set(identity, [
      ...(labelsBySemanticIdentity.get(identity) ?? []),
      label,
    ]);
  }
  const relations: ReaderSummaryTopicRelationCandidate[] = [];
  for (const labels of labelsBySemanticIdentity.values()) {
    for (let left = 0; left < labels.length; left += 1) {
      for (let right = left + 1; right < labels.length; right += 1) {
        relations.push({
          sourceNodeId: labels[left]!.nodeId,
          targetNodeId: labels[right]!.nodeId,
          sharedTerms: meaningfulTopicLabelTokens(
            labels[left]!.semantic?.subject ?? "",
          ).slice(0, 4),
        });
      }
    }
  }

  return relations;
};

export const combineReaderSummaryTopicRelations = (
  priority: readonly ReaderSummaryTopicRelationCandidate[],
  additional: readonly ReaderSummaryTopicRelationCandidate[],
  limit: number,
): readonly ReaderSummaryTopicRelationCandidate[] => {
  const combined = new Map<string, ReaderSummaryTopicRelationCandidate>();
  for (const relation of [...priority, ...additional]) {
    if (!combined.has(relationPairKey(relation))) {
      combined.set(relationPairKey(relation), relation);
    }
  }

  return [...combined.values()].slice(0, Math.max(0, limit));
};

const candidateRelationshipTerms = (
  candidate: ReaderSummaryTopicRelationSource,
): ReadonlySet<string> =>
  new Set(
    [
      candidate.fallbackLabel,
      ...candidate.keywords,
      ...candidate.labelCandidates.map((item) => item.label),
    ]
      .flatMap(meaningfulTopicLabelTokens)
      .filter((term) => !relationshipNoiseTerms.has(term)),
  );

const relationshipNoiseTerms = new Set([
  "agent",
  "ai",
  "availability",
  "benchmark",
  "comparison",
  "ecosystem",
  "family",
  "guide",
  "model",
  "product",
  "release",
  "rollout",
]);

const relationPairKey = (relation: {
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
}): string =>
  [relation.sourceNodeId, relation.targetNodeId].sort().join("\u0000");
