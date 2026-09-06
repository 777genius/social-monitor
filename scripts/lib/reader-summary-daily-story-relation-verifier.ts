import {
  AgentRuntimeReaderSummaryStoryRelationVerifier,
  resolveAgentRuntimeReaderSummaryStoryRelationVerifierOptions,
} from "@social-monitor/summary/adapters/model/agent-runtime-reader-summary-story-relation-verifier.adapter";
import type {
  VerifiedReaderSummaryExecutionAttestationSink,
} from "@social-monitor/summary/adapters/model/reader-summary-execution-attestation";
import type {
  AgentRuntimeClientPort,
  ReaderSummaryStoryRelationVerifierPort,
} from "@social-monitor/summary/ports";

import {
  createReaderSummaryDailyPublicationExecutionWiring,
  type ReaderSummaryDailyReplayInput,
} from
  "./reader-summary-daily-publication-finalizer";

type DailyPublicationExecutionInput = Omit<
  Parameters<typeof createReaderSummaryDailyPublicationExecutionWiring>[0],
  "storyRelationVerifier"
>;

export const createReaderSummaryDailyCapturePublicationWiring = (
  input: DailyPublicationExecutionInput & StoryRelationCompositionInput,
) => {
  const {
    agentRuntimeClient,
    env,
    summaryModelMode,
    storyRelationVerifierGuard,
    ...publicationInput
  } = input;
  return createReaderSummaryDailyPublicationExecutionWiring({
    ...publicationInput,
    storyRelationVerifier: buildReaderSummaryDailyStoryRelationVerifier({
      replay: publicationInput.replay,
      summaryModelMode,
      env,
      agentRuntimeClient,
      attestationSink: publicationInput.attestationSink,
      storyRelationVerifierGuard,
    }),
  });
};

type StoryRelationCompositionInput = {
  readonly replay: ReaderSummaryDailyReplayInput | null;
  readonly summaryModelMode:
    | "deterministic"
    | "openai-responses"
    | "agent-runtime";
  readonly env: NodeJS.ProcessEnv;
  readonly agentRuntimeClient: AgentRuntimeClientPort | null;
  readonly attestationSink: VerifiedReaderSummaryExecutionAttestationSink;
  readonly storyRelationVerifierGuard?: {
    assertUsable(): void;
    invalidateAdapter(taskRole: "story_relation" | "related_topic_relation"): void;
  };
};

const buildReaderSummaryDailyStoryRelationVerifier = (
  input: StoryRelationCompositionInput,
): ReaderSummaryStoryRelationVerifierPort | null => {
  if (input.replay !== null || input.summaryModelMode !== "agent-runtime") {
    return null;
  }
  if (input.agentRuntimeClient === null) {
    throw new Error(
      "Fresh agent-runtime daily publication requires a story relation verifier client",
    );
  }
  const verifier = new AgentRuntimeReaderSummaryStoryRelationVerifier({
    ...resolveAgentRuntimeReaderSummaryStoryRelationVerifierOptions(
      input.env,
      input.agentRuntimeClient,
    ),
    verifiedAttestationSink: input.attestationSink,
  });
  const guard = input.storyRelationVerifierGuard;
  if (guard === undefined) return verifier;
  return {
    verify: async (query) => {
      try {
        guard.assertUsable();
        const decisions = await verifier.verify(query);
        guard.assertUsable();
        return decisions;
      } catch (error) {
        // Refresh authority must be poisoned before selector fallback catches
        // adapter exceptions. Accepted decisions retain their normal reconciliation.
        guard.invalidateAdapter(query.verificationLane === "related_topic"
          ? "related_topic_relation" : "story_relation");
        throw error;
      }
    },
  };
};
