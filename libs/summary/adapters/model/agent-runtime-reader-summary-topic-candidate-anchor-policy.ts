import { meaningfulTopicLabelTokens } from "../../domain";
import type { ReaderSummaryTopicLabelerInput } from "../../ports";

type TopicCandidate =
  ReaderSummaryTopicLabelerInput["candidates"][number];

// The domain tokenizer decides which words are meaningful; this bounded-context
// policy removes identity-neutral terms before cohort overlap is considered.
/** Identity anchors intentionally exclude descriptive keywords and alternatives. */
export const groundedCandidateTopicAnchors = (
  candidate: TopicCandidate,
): ReadonlySet<string> =>
  new Set(
    meaningfulTopicLabelTokens(candidate.fallbackLabel).filter(
      (term) => !nonDiscriminativeCandidateTerms.has(term),
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
