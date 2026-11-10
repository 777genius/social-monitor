import { buildGroundedTopicCohorts, type GroundedTopicCohort } from "./agent-runtime-reader-summary-cohort-grouping";
export { buildGroundedTopicCohorts } from "./agent-runtime-reader-summary-cohort-grouping";
export type { GroundedTopicCohort } from "./agent-runtime-reader-summary-cohort-grouping";
import { meaningfulTopicLabelTokens } from "../../domain";
import type { ReaderSummaryTopicLabelerInput } from "../../ports";

type TopicCandidate =
  ReaderSummaryTopicLabelerInput["candidates"][number];

/** Identity anchors intentionally exclude descriptive keywords and alternatives. */
export const groundedCandidateTopicAnchors = (
  candidate: TopicCandidate,
): ReadonlySet<string> =>
  new Set(
    meaningfulTopicLabelTokens(candidate.fallbackLabel).filter(
      (term) => !nonDiscriminativeCandidateTerms.has(term),
    ),
  );

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

const nonDiscriminativeCandidateTerms = new Set([
  "ai",
  "agent",
  "agents",
  "availability",
  "benchmark",
  "code",
  "comparison",
  "content",
  "cost",
  "costs",
  "developer",
  "developers",
  "ecosystem",
  "ecosystems",
  "education",
  "efficiency",
  "engagement",
  "event",
  "family",
  "industry",
  "industries",
  "href",
  "http",
  "https",
  "limits",
  "model",
  "models",
  "product",
  "products",
  "provider",
  "quality",
  "release",
  "review",
  "rollout",
  "security",
  "signal",
  "software",
  "technology",
  "technologies",
  "top",
  "topic",
  "tool",
  "tools",
  "hey",
  "never",
  "ve",
  "will",
]);
