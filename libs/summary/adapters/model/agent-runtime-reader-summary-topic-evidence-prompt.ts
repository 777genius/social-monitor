import type { ReaderSummaryTopicLabelerInput } from "../../ports";
import { buildAgentRuntimeTopicEvidenceSamples } from "./agent-runtime-reader-summary-topic-evidence-samples";

// Keep the original public name stable for existing model and test consumers.
export { buildAgentRuntimeTopicEvidenceSamples } from "./agent-runtime-reader-summary-topic-evidence-samples";

// Trusted candidate projection is separate from untrusted evidence admission.
/** Bind only selected evidence from each candidate's own story cluster. */
export const buildAgentRuntimeTopicPromptNodes = (
  input: Pick<ReaderSummaryTopicLabelerInput, "clusters" | "selectedEvidence">,
  candidates: readonly ReaderSummaryTopicLabelerInput["candidates"][number][],
) => {
  const evidenceByFeedItemId = new Map(
    input.selectedEvidence.map((item) => [item.feedItemId, item] as const),
  );
  const clusterById = new Map(
    input.clusters.map((cluster) => [cluster.id, cluster] as const),
  );
  return candidates.map((candidate) => ({
    nodeId: candidate.nodeId,
    fallbackLabel: candidate.fallbackLabel,
    summary: candidate.summary,
    score: candidate.score,
    evidenceCount: candidate.evidenceCount,
    providerKeys: candidate.providerKeys,
    interestIds: candidate.interestIds,
    keywords: candidate.keywords,
    labelCandidates: candidate.labelCandidates.map((labelCandidate) => ({
      label: labelCandidate.label,
      source: labelCandidate.source,
      score: labelCandidate.score,
      evidenceFeedItemIds: labelCandidate.evidenceFeedItemIds,
      rationale: labelCandidate.rationale,
    })),
    evidenceSamples: buildAgentRuntimeTopicEvidenceSamples({
      candidate,
      clusterById,
      evidenceByFeedItemId,
    }),
  }));
};
