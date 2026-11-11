import { buildReaderSummaryTopicRelationCandidates } from "../../domain";
import type {
  ReaderSummaryTopicLabelerInput,
  ReaderSummaryTopicMapAttemptContext,
} from "../../ports";
import { buildAgentRuntimeTopicPromptNodes } from "./agent-runtime-reader-summary-topic-evidence-prompt";
import { buildAgentRuntimeTopicLabelerPromptPolicy } from "./agent-runtime-reader-summary-topic-labeler-policy";
export { selectAgentRuntimeReaderSummaryTopicCandidates } from "./agent-runtime-reader-summary-topic-candidate-selection";

// The provider instruction policy is separately owned from untrusted evidence projection.
export { agentRuntimeReaderSummaryTopicLabelerInstructions } from "./agent-runtime-reader-summary-topic-labeler-instructions";

export const buildAgentRuntimeReaderSummaryTopicLabelPrompt = (
  input: ReaderSummaryTopicLabelerInput,
  candidates: readonly ReaderSummaryTopicLabelerInput["candidates"][number][],
  attemptContext?: ReaderSummaryTopicMapAttemptContext,
): string => {
  return JSON.stringify(
    {
      task: "Label and group topic nodes for a summary bubble map.",
      ...buildAgentRuntimeTopicLabelerPromptPolicy(candidates, attemptContext),
      period: {
        cadence: input.period.cadence,
        startedAt: input.period.startedAt.toISOString(),
        endedAt: input.period.endedAt.toISOString(),
        timezone: input.period.timezone,
      },
      relationshipHints: buildReaderSummaryTopicRelationCandidates(candidates),
      nodes: buildAgentRuntimeTopicPromptNodes(input, candidates),
    },
    null,
    2,
  );
};

export { agentRuntimeReaderSummaryTopicLabelerJsonSchema } from "./agent-runtime-reader-summary-topic-labeler-response-schema";
