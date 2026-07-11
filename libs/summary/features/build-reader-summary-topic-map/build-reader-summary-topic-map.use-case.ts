import {
  DomainError,
  err,
  ok,
  type Result,
} from "@social-monitor/shared-kernel";

import {
  buildExistingReaderSummaryTopicRelations,
  buildReaderSummaryTopicMap,
  buildReaderSummaryTopicRelationCandidates,
  buildSemanticallyEquivalentReaderSummaryTopicRelations,
  combineReaderSummaryTopicRelations,
  evaluateReaderSummaryTopicMapStructure,
  extractReaderSummaryTopicLabelCandidates,
  READER_SUMMARY_TOPIC_RELATION_MAX_CANDIDATES,
  reconcileVerifiedReaderSummaryTopicRelations,
  type ReaderSummaryTopicMap,
  type ReaderSummaryTopicLabelPlan,
} from "../../domain";
import type {
  ReaderSummaryTopicLabelCandidate,
  ReaderSummaryTopicLabelerPort,
  ReaderSummaryTopicMapPublicationAuditPort,
  ReaderSummaryTopicRelationVerifierPort,
  ReaderSummaryTopicLabelerInput,
} from "../../ports";
import type { BuildReaderSummaryTopicMapCommand } from "./build-reader-summary-topic-map.command";

export type BuildReaderSummaryTopicMapMode = "deterministic" | "agent-runtime";

export type BuildReaderSummaryTopicMapUseCaseOptions = {
  readonly mode?: BuildReaderSummaryTopicMapMode;
  readonly labeler?: ReaderSummaryTopicLabelerPort | null;
  readonly publicationAudit?: ReaderSummaryTopicMapPublicationAuditPort | null;
  readonly relationVerifier?: ReaderSummaryTopicRelationVerifierPort | null;
};
export type BuildReaderSummaryTopicMapResult = Result<
  ReaderSummaryTopicMap,
  DomainError
>;

export class BuildReaderSummaryTopicMapUseCase {
  private readonly mode: BuildReaderSummaryTopicMapMode;
  private readonly labeler: ReaderSummaryTopicLabelerPort | null;
  private readonly publicationAudit: ReaderSummaryTopicMapPublicationAuditPort | null;
  private readonly relationVerifier: ReaderSummaryTopicRelationVerifierPort | null;

  constructor(options: BuildReaderSummaryTopicMapUseCaseOptions = {}) {
    this.mode = options.mode ?? "deterministic";
    this.labeler = options.labeler ?? null;
    this.publicationAudit = options.publicationAudit ?? null;
    this.relationVerifier = options.relationVerifier ?? null;
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
      preserveStoryClustersForLabeling: this.mode === "agent-runtime",
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

    const verifiedPlanResult = await this.verifyTopicRelations(
      labelPlanResult.value.input,
      labelPlanResult.value.labelPlan,
    );
    if (!verifiedPlanResult.ok) {
      return verifiedPlanResult;
    }

    return publishableTopicMap(
      buildReaderSummaryTopicMap({
        clusters: command.clusters,
        selectedEvidence: command.selectedEvidence,
        topStories: command.topStories,
        citationMap: command.citationMap,
        labelPlan: verifiedPlanResult.value,
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
      {
        readonly labelPlan: Awaited<
          ReturnType<ReaderSummaryTopicLabelerPort["label"]>
        >;
        readonly input: ReaderSummaryTopicLabelerInput;
      },
      DomainError
    >
  > {
    try {
      const evidenceById = new Map(
        command.selectedEvidence.map(
          (item) => [item.feedItemId, item] as const,
        ),
      );
      const clusterById = new Map(
        command.clusters.map((cluster) => [cluster.id, cluster] as const),
      );
      const storyByClusterId = new Map(
        command.topStories.map(
          (story) => [story.storyClusterId, story] as const,
        ),
      );

      const input = {
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
                    (item): item is (typeof command.selectedEvidence)[number] =>
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
      } satisfies ReaderSummaryTopicLabelerInput;

      return ok({ labelPlan: await this.labeler!.label(input), input });
    } catch (error) {
      return err(topicMapFailure(topicLabelerFailureMessage(error)));
    }
  }

  private async verifyTopicRelations(
    input: ReaderSummaryTopicLabelerInput,
    labelPlan: ReaderSummaryTopicLabelPlan,
  ): Promise<Result<ReaderSummaryTopicLabelPlan, DomainError>> {
    const reviewedNodeIds = new Set(
      labelPlan.nodeLabels.map((label) => label.nodeId),
    );
    const reviewedCandidates = input.candidates.filter((candidate) =>
      reviewedNodeIds.has(candidate.nodeId),
    );
    const existingRelations = buildExistingReaderSummaryTopicRelations(
      reviewedCandidates,
      labelPlan.nodeLabels,
    );
    if (this.relationVerifier === null) {
      return existingRelations.length === 0
        ? ok(labelPlan)
        : err(
            topicMapFailure(
              "Reader summary topic map requires a relation verifier when the labeler proposes topic merges",
            ),
          );
    }
    const requiredRelations = combineReaderSummaryTopicRelations(
      existingRelations,
      buildSemanticallyEquivalentReaderSummaryTopicRelations(
        reviewedCandidates,
        labelPlan.nodeLabels,
      ),
      Number.MAX_SAFE_INTEGER,
    );
    if (
      requiredRelations.length > READER_SUMMARY_TOPIC_RELATION_MAX_CANDIDATES
    ) {
      return err(
        topicMapFailure(
          `Reader summary topic relation verification requires ${requiredRelations.length} checks, above the safe limit of ${READER_SUMMARY_TOPIC_RELATION_MAX_CANDIDATES}`,
        ),
      );
    }
    const relations = combineReaderSummaryTopicRelations(
      requiredRelations,
      buildReaderSummaryTopicRelationCandidates(reviewedCandidates),
      READER_SUMMARY_TOPIC_RELATION_MAX_CANDIDATES,
    );
    if (relations.length === 0) {
      return ok(labelPlan);
    }

    try {
      const decisions = await this.relationVerifier.verify({
        ...input,
        labelPlan,
        relations,
      });

      return ok(
        reconcileVerifiedReaderSummaryTopicRelations({
          labelPlan,
          candidates: relations,
          decisions,
        }),
      );
    } catch {
      return ok(
        reconcileVerifiedReaderSummaryTopicRelations({
          labelPlan,
          candidates: relations,
          decisions: [],
          verificationWarning:
            "Topic merges were kept separate because focused semantic relation verification was unavailable",
        }),
      );
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
