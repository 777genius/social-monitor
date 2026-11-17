import type { ReaderSummaryTopicLabelerInput } from "../../ports";

type TopicCandidate = ReaderSummaryTopicLabelerInput["candidates"][number];

/**
 * Index trusted, selected topic candidates by immutable node identity.
 * Duplicate ids cannot supply conflicting fallback labels/anchors via
 * last-writer-wins Map behavior.
 */
export const indexUniqueReaderSummaryTopicCandidates = (
  candidates: readonly TopicCandidate[],
): ReadonlyMap<string, TopicCandidate> => {
  const byId = new Map<string, TopicCandidate>();
  for (const candidate of candidates) {
    if (byId.has(candidate.nodeId)) {
      throw new Error("Reader summary topic candidate nodeIds must be unique");
    }
    byId.set(candidate.nodeId, candidate);
  }
  return byId;
};
