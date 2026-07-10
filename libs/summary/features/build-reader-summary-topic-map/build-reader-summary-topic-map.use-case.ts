import {
  DomainError,
  err,
  ok,
  type Result,
} from "@social-monitor/shared-kernel";

import {
  buildReaderSummaryTopicMap,
  evaluateReaderSummaryTopicMapStructure,
  extractReaderSummaryTopicLabelCandidates,
  type ReaderSummaryTopicMap,
} from "../../domain";
import type {
  ReaderSummaryTopicLabelCandidate,
  ReaderSummaryTopicLabelerPort,
  ReaderSummaryTopicMapPublicationAuditPort,
} from "../../ports";
import type { BuildReaderSummaryTopicMapCommand } from "./build-reader-summary-topic-map.command";

export type BuildReaderSummaryTopicMapMode = "deterministic" | "agent-runtime";

export type BuildReaderSummaryTopicMapUseCaseOptions = {
  readonly mode?: BuildReaderSummaryTopicMapMode;
  readonly labeler?: ReaderSummaryTopicLabelerPort | null;
  readonly publicationAudit?: ReaderSummaryTopicMapPublicationAuditPort | null;
};
export type BuildReaderSummaryTopicMapResult = Result<
  ReaderSummaryTopicMap,
  DomainError
>;

export class BuildReaderSummaryTopicMapUseCase {
  private readonly mode: BuildReaderSummaryTopicMapMode;
  private readonly labeler: ReaderSummaryTopicLabelerPort | null;
  private readonly publicationAudit: ReaderSummaryTopicMapPublicationAuditPort | null;

  constructor(options: BuildReaderSummaryTopicMapUseCaseOptions = {}) {
    this.mode = options.mode ?? "deterministic";
    this.labeler = options.labeler ?? null;
    this.publicationAudit = options.publicationAudit ?? null;
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
      return publishableTopicMap(deterministic, this.publicationAudit);
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

    return publishableTopicMap(
      buildReaderSummaryTopicMap({
        clusters: command.clusters,
        selectedEvidence: command.selectedEvidence,
        topStories: command.topStories,
        citationMap: command.citationMap,
        labelPlan: labelPlanResult.value,
        generatedBy: "agent-runtime",
      }),
      this.publicationAudit,
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
      const evidenceById = new Map(
        command.selectedEvidence.map((item) => [item.feedItemId, item] as const),
      );
      const clusterById = new Map(
        command.clusters.map((cluster) => [cluster.id, cluster] as const),
      );
      const storyByClusterId = new Map(
        command.topStories.map((story) => [story.storyClusterId, story] as const),
      );

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
            const cluster = clusterById.get(storyClusterId);
            const evidence =
              cluster === undefined
                ? []
                : [
                    cluster.representativeFeedItemId,
                    ...cluster.duplicateFeedItemIds,
                  ]
                    .map((id) => evidenceById.get(id))
                    .filter(
                      (
                        item,
                      ): item is (typeof command.selectedEvidence)[number] =>
                        item !== undefined,
                    );

            return {
              nodeId: node.id,
              storyClusterId,
              fallbackLabel: node.label,
              summary: storyByClusterId.get(storyClusterId)?.summary,
              score: node.popularityScore,
              evidenceCount: node.evidenceCount,
              providerKeys: node.providerKeys,
              interestIds: node.interestIds,
              keywords: node.keywords,
              labelCandidates:
                cluster === undefined
                  ? []
                  : extractReaderSummaryTopicLabelCandidates({
                      story: storyByClusterId.get(storyClusterId),
                      evidence,
                      fallbackKeywords: node.keywords,
                      fallbackLabel: node.label,
                      cluster,
                    }),
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

const publishableTopicMap = async (
  topicMap: ReaderSummaryTopicMap,
  publicationAudit: ReaderSummaryTopicMapPublicationAuditPort | null,
): Promise<BuildReaderSummaryTopicMapResult> => {
  const structure = evaluateReaderSummaryTopicMapStructure(topicMap);
  const minimumGroupedCoverage =
    topicMap.generatedBy === "agent-runtime" && topicMap.nodes.length >= 4
      ? 0.5
      : 0;
  if (
    structure.passed &&
    structure.metrics.groupedCoverage >= minimumGroupedCoverage
  ) {
    return ok(topicMap);
  }

  await publicationAudit?.recordRejectedCandidate({
    topicMap,
    structureQuality: structure,
    minimumGroupedCoverage,
  });

  return err(
    topicMapFailure(
      `Reader summary topic map failed publication quality: ${[
        ...structure.issues,
        ...(structure.metrics.groupedCoverage < minimumGroupedCoverage
          ? ["agent-runtime grouped coverage is below 0.5"]
          : []),
      ].join("; ")}`,
    ),
  );
};

const topicLabelerFailureMessage = (error: unknown): string =>
  error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "Reader summary topic labeler failed";
