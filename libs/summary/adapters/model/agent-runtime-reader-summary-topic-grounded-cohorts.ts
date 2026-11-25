import { buildGroundedTopicCohorts, type GroundedTopicCohort } from "./agent-runtime-reader-summary-cohort-grouping";
export { buildGroundedTopicCohorts } from "./agent-runtime-reader-summary-cohort-grouping";
export type { GroundedTopicCohort } from "./agent-runtime-reader-summary-cohort-grouping";
import type { ReaderSummaryTopicLabelerInput } from "../../ports";

import { groundedCandidateTopicAnchors } from "./agent-runtime-reader-summary-topic-candidate-anchor-policy";
export { groundedCandidateTopicAnchors } from "./agent-runtime-reader-summary-topic-candidate-anchor-policy";

type TopicCandidate =
  ReaderSummaryTopicLabelerInput["candidates"][number];

export const buildGroundedTopicCohortsForCandidates = (
  candidates: readonly TopicCandidate[],
): readonly GroundedTopicCohort[] =>
  buildGroundedTopicCohorts(
    candidates.map((candidate) => candidate.nodeId),
    new Map(
      candidates.map((candidate) => [
        candidate.nodeId,
        groundedCandidateTopicAnchors(candidate),
      ]),
    ),
  );
