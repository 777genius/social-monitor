import type { ReaderSummaryTopicRelationVerifierInput } from "../../ports";
import { buildAgentRuntimeTopicEvidenceSamples } from "./agent-runtime-reader-summary-topic-evidence-prompt";

/** Resolve relation nodes only against their labeled candidates and selected cluster evidence. */
export const buildAgentRuntimeReaderSummaryTopicRelationNodeProjection = (
  input: ReaderSummaryTopicRelationVerifierInput,
) => {
  const candidateByNodeId = new Map(
    input.candidates.map((candidate) => [candidate.nodeId, candidate] as const),
  );
  const labelByNodeId = new Map(
    input.labelPlan.nodeLabels.map((label) => [label.nodeId, label] as const),
  );
  const evidenceByFeedItemId = new Map(
    input.selectedEvidence.map((item) => [item.feedItemId, item] as const),
  );
  const clusterById = new Map(
    input.clusters.map((cluster) => [cluster.id, cluster] as const),
  );
  return (nodeId: string) => {
    const candidate = candidateByNodeId.get(nodeId);
    const label = labelByNodeId.get(nodeId);
    if (candidate === undefined || label === undefined) {
      throw new Error(`Unknown topic relation node ${nodeId}`);
    }

    return {
      nodeId,
      label: label.label ?? candidate.fallbackLabel,
      topicId: label.topicId,
      subject: label.semantic?.subject,
      claimType: label.semantic?.claimType,
      qualifier: label.semantic?.qualifier,
      parentSubject: label.semantic?.parentSubject,
      semanticConfidenceScore: label.semantic?.confidenceScore,
      summary: candidate.summary,
      evidenceSamples: buildAgentRuntimeTopicEvidenceSamples({
        candidate,
        clusterById,
        evidenceByFeedItemId,
      }),
    };
  };
};
