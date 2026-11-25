import type { ReaderSummaryTopicLabelerInput } from "../../ports";
import { selectGroundedTopicCandidateCoverage } from "./agent-runtime-reader-summary-topic-candidate-coverage";
import { rankUniqueAgentRuntimeTopicCandidates } from "./agent-runtime-reader-summary-topic-candidate-priority";

type TopicCandidate =
  ReaderSummaryTopicLabelerInput["candidates"][number];

export const selectAgentRuntimeReaderSummaryTopicCandidates = (
  input: Pick<ReaderSummaryTopicLabelerInput, "candidates" | "clusters">,
  maxCandidates: number,
): readonly TopicCandidate[] => {
  const configuredLimit = Math.max(0, Math.floor(maxCandidates));
  if (configuredLimit === 0) {
    return [];
  }
  const ranked = rankUniqueAgentRuntimeTopicCandidates(input);
  const boundedLimit = Math.min(configuredLimit, ranked.length);
  return selectGroundedTopicCandidateCoverage(ranked, boundedLimit);
};
