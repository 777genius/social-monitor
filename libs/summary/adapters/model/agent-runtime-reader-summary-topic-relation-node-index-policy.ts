import type { ReaderSummaryTopicRelationVerifierInput } from "../../ports";

type RelationNode = { readonly nodeId: string };

/**
 * Admission is scoped to nodes actually used by requested pairs. A repeated
 * label/candidate for one of those nodes must not silently win in a Map and
 * change the evidence presented to a paid model.
 */
const uniqueRequestedNodeIndex = <T extends RelationNode>(
  entries: readonly T[],
  requestedIds: ReadonlySet<string>,
  kind: "candidate" | "label",
): ReadonlyMap<string, T> => {
  const index = new Map<string, T>();
  for (const entry of entries) {
    if (!requestedIds.has(entry.nodeId)) continue;
    if (index.has(entry.nodeId)) {
      throw new Error(`Ambiguous topic relation ${kind} ${entry.nodeId}`);
    }
    index.set(entry.nodeId, entry);
  }
  return index;
};

export const indexRequestedTopicRelationNodes = (
  input: Pick<ReaderSummaryTopicRelationVerifierInput, "relations" | "candidates" | "labelPlan">,
) => {
  const requestedIds = new Set(
    input.relations.flatMap((relation) => [relation.sourceNodeId, relation.targetNodeId]),
  );
  return {
    candidateByNodeId: uniqueRequestedNodeIndex(input.candidates, requestedIds, "candidate"),
    labelByNodeId: uniqueRequestedNodeIndex(input.labelPlan.nodeLabels, requestedIds, "label"),
  };
};
