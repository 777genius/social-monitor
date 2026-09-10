import { createHeadlineDiagnosticArtifact, type HeadlineDiagnosticArtifactOptions } from "./reader-summary-headline-diagnostic-artifact";
import { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";
import { InMemoryUserRelevanceProfileRepository } from "@social-monitor/relevance/adapters/persistence/in-memory-user-relevance-profile.repository";
import type { RankFeedItemsCommand } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.command";
import { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import { RelevanceReaderSummaryEvidenceSelector } from "@social-monitor/summary/adapters/evidence/relevance-reader-summary-evidence.selector";
import type { ReaderSummaryPreparationObserver } from "@social-monitor/summary/adapters/evidence/reader-summary-preparation-observer";
import { StoryRankingMetricsRecorder } from "@social-monitor/summary/adapters/metrics/story-ranking-metrics.recorder";
import { PrismaReaderSummaryGitHubProjectionReader } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-github-projection.reader";
import { createSourceContentAssessmentReviewer } from "@social-monitor/relevance/interfaces/rest/source-content-assessment-provider-tokens";
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
): ReturnType<typeof createReaderSummaryDailyPublicationExecutionWiring> => {
  const {
    agentRuntimeClient,
    env,
    summaryModelMode,
    storyRelationVerifierGuard,
    preparationObserver,
    headlineDiagnosticArtifact,
    rankCommandCapture,
    relationCapture,
    ...publicationInput
  } = input;
  const dependencies = {
    ...publicationInput,
    storyRelationVerifier: buildReaderSummaryDailyStoryRelationVerifier({
      replay: publicationInput.replay,
      summaryModelMode,
      env,
      agentRuntimeClient,
      attestationSink: publicationInput.attestationSink,
      storyRelationVerifierGuard,
      relationCapture,
    }),
    qualityReviewer: publicationInput.replay !== null ? undefined
      : publicationInput.qualityReviewer ?? createSourceContentAssessmentReviewer({
          env, summaryModelMode, client: agentRuntimeClient ?? undefined, clock: publicationInput.clock,
        }),

  };
  if ((preparationObserver === undefined && rankCommandCapture === undefined && headlineDiagnosticArtifact === undefined) || publicationInput.replay !== null) {
    return createReaderSummaryDailyPublicationExecutionWiring(dependencies);
  }
  // This is the same fresh composition as the finalizer, with P1's trailing
  // observer option. It runs one rank/selector invocation, never a capture pass.
  if (dependencies.feedItems === undefined || dependencies.configuredInterests === undefined) {
    throw new Error("Fresh capture requires feed and configured interest authority");
  }
  const rankFeedItems = new RankFeedItemsUseCase(
    dependencies.feedItems,
    new InMemoryUserRelevanceProfileRepository(),
    dependencies.clock,
    undefined, undefined, undefined, dependencies.qualityReviewer, undefined,
    dependencies.configuredInterests,
  );
  if (rankCommandCapture !== undefined) {
    const execute = rankFeedItems.execute.bind(rankFeedItems);
    rankFeedItems.execute = (command) => {
      try {
        const { observePromotionPreparation: _observer, observeHeadlineDiagnostic: _headlineObserver, promotionAssessmentExecution, ...values } = command;
        void _headlineObserver;
        void _observer;
        rankCommandCapture.captured({
          ...values,
          ...(promotionAssessmentExecution === undefined ? {} : {
            promotionAssessmentExecution: { deadlineAtMs: promotionAssessmentExecution.deadlineAtMs },
          }),
        });
      } catch {
        try { rankCommandCapture.failed(); } catch { /* Capture cannot alter policy. */ }
      }
      return execute(command);
    };
  }
  if (headlineDiagnosticArtifact !== undefined) {
    const execute = rankFeedItems.execute.bind(rankFeedItems);
    rankFeedItems.execute = async (command) => {
      // Diagnostic setup failures also fall back to the exact original invocation.
      let artifact: ReturnType<typeof createHeadlineDiagnosticArtifact> | undefined;
      try { artifact = createHeadlineDiagnosticArtifact(headlineDiagnosticArtifact, command); } catch { /* fail safe */ }
      try {
        return await execute(artifact === undefined ? command : { ...command, observeHeadlineDiagnostic: artifact.observe });
      } finally { artifact?.flush(); }
    };
  }
  return Object.freeze({
    evidenceSelector: new RelevanceReaderSummaryEvidenceSelector(
      rankFeedItems, dependencies.feedItems, dependencies.clock,
      new StoryRankingMetricsRecorder(new InMemoryMetricsRecorder()),
      dependencies.storyRelationVerifier ?? undefined, undefined, preparationObserver,
    ),
    githubProjectionReader: new PrismaReaderSummaryGitHubProjectionReader(dependencies.summaryClient),
  });
};

type RelationQuery = Parameters<ReaderSummaryStoryRelationVerifierPort["verify"]>[0];

export type ReaderSummaryDailyRelationCapture = {
  attempted(query: RelationQuery): void;
  validated(query: RelationQuery, decisions: readonly unknown[]): void;
  failed(query: RelationQuery): void;
  captureFailed(): void;
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
  readonly rankCommandCapture?: {
    captured(command: Omit<RankFeedItemsCommand, "observePromotionPreparation">): void;
    failed(): void;
  };
  readonly preparationObserver?: ReaderSummaryPreparationObserver;
  readonly headlineDiagnosticArtifact?: HeadlineDiagnosticArtifactOptions;
  readonly relationCapture?: ReaderSummaryDailyRelationCapture;
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
  const capture = input.relationCapture;
  if (guard === undefined && capture === undefined) return verifier;
  const observe = (callback: () => void): void => {
    try { callback(); } catch {
      try { capture?.captureFailed(); } catch { /* Capture cannot alter policy. */ }
    }
  };
  return {
    verify: async (query) => {
      observe(() => capture?.attempted(query));
      try {
        guard?.assertUsable();
        const decisions = await verifier.verify(query);
        guard?.assertUsable();
        observe(() => capture?.validated(query, decisions));
        return decisions;
      } catch (error) {
        // Refresh authority must be poisoned before selector fallback catches
        // adapter exceptions. Accepted decisions retain their normal reconciliation.
        observe(() => capture?.failed(query));
        guard?.invalidateAdapter(query.verificationLane === "related_topic"
          ? "related_topic_relation" : "story_relation");
        throw error;
      }
    },
  };
};
