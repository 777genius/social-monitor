import type { ReaderSummaryTopicRelationVerifierInput } from "../../ports";
import { buildAgentRuntimeReaderSummaryTopicRelationNodeProjection } from "./agent-runtime-reader-summary-topic-relation-node-evidence";

/** Bind each requested relation to its own trusted, scoped node evidence. */
export const projectAgentRuntimeReaderSummaryTopicRelationPairs = (
  input: ReaderSummaryTopicRelationVerifierInput,
) => {
  const node = buildAgentRuntimeReaderSummaryTopicRelationNodeProjection(input);
  return input.relations.map((relation) => ({
    sourceNodeId: relation.sourceNodeId,
    targetNodeId: relation.targetNodeId,
    sharedTerms: relation.sharedTerms,
    source: node(relation.sourceNodeId),
    target: node(relation.targetNodeId),
  }));
};
