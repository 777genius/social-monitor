import {
  DomainError,
  err,
  ok,
  type Result,
} from "@social-monitor/shared-kernel";

import {
  buildReaderSummaryTopicMap,
  topicNodeId,
  type ReaderSummaryTopicMap,
} from "../../domain";
import type {
  ReaderSummaryTopicLabelCandidate,
  ReaderSummaryTopicLabelerPort,
} from "../../ports";
import type { BuildReaderSummaryTopicMapCommand } from "./build-reader-summary-topic-map.command";

export type BuildReaderSummaryTopicMapMode = "deterministic" | "agent-runtime";

export type BuildReaderSummaryTopicMapUseCaseOptions = {
  readonly mode?: BuildReaderSummaryTopicMapMode;
  readonly labeler?: ReaderSummaryTopicLabelerPort | null;
};
export type BuildReaderSummaryTopicMapResult = Result<
  ReaderSummaryTopicMap,
  DomainError
>;

export class BuildReaderSummaryTopicMapUseCase {
  private readonly mode: BuildReaderSummaryTopicMapMode;
  private readonly labeler: ReaderSummaryTopicLabelerPort | null;

  constructor(options: BuildReaderSummaryTopicMapUseCaseOptions = {}) {
    this.mode = options.mode ?? "deterministic";
    this.labeler = options.labeler ?? null;
  }

  async execute(
    command: BuildReaderSummaryTopicMapCommand,
  ): Promise<BuildReaderSummaryTopicMapResult> {
    const deterministic = buildReaderSummaryTopicMap({
      clusters: command.clusters,
      selectedEvidence: command.selectedEvidence,
      topStories: command.topStories,
      citationMap: command.citationMap,
      generatedBy: "deterministic",
    });

    if (this.mode === "deterministic" || deterministic.nodes.length === 0) {
      return ok(deterministic);
    }

    if (this.labeler === null) {
      return err(
        topicMapFailure(
          "Reader summary topic map agent-runtime mode requires a topic labeler",
        ),
      );
    }

    const labelPlanResult = await this.labelWithAgentRuntime(
      command,
      deterministic,
    );
    if (!labelPlanResult.ok) {
      return labelPlanResult;
    }

    return ok(
      buildReaderSummaryTopicMap({
        clusters: command.clusters,
        selectedEvidence: command.selectedEvidence,
        topStories: command.topStories,
        citationMap: command.citationMap,
        labelPlan: labelPlanResult.value,
        generatedBy: "agent-runtime",
      }),
    );
  }

  private async labelWithAgentRuntime(
    command: BuildReaderSummaryTopicMapCommand,
    deterministic: ReaderSummaryTopicMap,
  ): Promise<
    Result<
      Awaited<ReturnType<ReaderSummaryTopicLabelerPort["label"]>>,
      DomainError
    >
  > {
    try {
      return ok(
        await this.labeler!.label({
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          scope: command.scope,
          period: command.period,
          requestedAt: command.requestedAt,
          clusters: command.clusters,
          selectedEvidence: command.selectedEvidence,
          topStories: command.topStories,
          candidates: deterministic.nodes.map((node) => {
            const storyClusterId = node.storyClusterIds[0] ?? node.id;

            return {
              nodeId: node.id,
              storyClusterId,
              fallbackLabel: node.label,
              summary: command.topStories.find(
                (story) => topicNodeId(story.storyClusterId) === node.id,
              )?.summary,
              score: node.popularityScore,
              evidenceCount: node.evidenceCount,
              providerKeys: node.providerKeys,
              interestIds: node.interestIds,
              keywords: node.keywords,
            } satisfies ReaderSummaryTopicLabelCandidate;
          }),
        }),
      );
    } catch (error) {
      return err(topicMapFailure(topicLabelerFailureMessage(error)));
    }
  }
}

const topicMapFailure = (message: string): DomainError =>
  new DomainError("external.dependency_unavailable", message, {
    dependency: "reader_summary_topic_labeler",
  });

const topicLabelerFailureMessage = (error: unknown): string =>
  error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "Reader summary topic labeler failed";
