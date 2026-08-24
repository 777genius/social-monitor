import { err, ok, type DomainError, type Result } from "@social-monitor/shared-kernel";

import {
  type ReaderSummaryArtifact,
  type ReaderSummaryContextArtifact,
  type ReaderSummaryJob,
  primaryReaderSummaryEvidence,
  type SummaryEvidenceSelection,
} from "../../domain";
import {
  type ProviderReaderSummaryAttempt,
  type ReaderSummaryContextProviderPort,
  type ReaderSummaryModelBudget,
  type ReaderSummaryModelFailure,
  type ReaderSummaryModelPolicy,
} from "../../ports";
import type { BuildReaderSummaryTopicMapUseCase } from "../build-reader-summary-topic-map/build-reader-summary-topic-map.use-case";
import type { ReaderSummaryDraftWithContent } from "./reader-summary-promotion-content";

export type ReaderSummaryModelPipelineResult = Result<
  {
    readonly artifact: ReaderSummaryArtifact;
    readonly evidence: SummaryEvidenceSelection;
    readonly editorialEvidence: SummaryEvidenceSelection;
  },
  ReaderSummaryModelFailure
>;
export type ReaderSummaryDraft = ProviderReaderSummaryAttempt["draft"];
export type ReaderSummaryContextBuildResult = {
  readonly artifacts: readonly ReaderSummaryContextArtifact[];
  readonly unavailable: boolean;
};

export const defaultModelPolicy: ReaderSummaryModelPolicy = {
  preferredProvider: "deterministic-local",
  maxInputTokens: 96_000,
  maxOutputTokens: 16_000,
  maxEstimatedCostUsd: 1,
};

export const defaultModelBudget: ReaderSummaryModelBudget = {
  remainingTokens: 160_000,
  remainingCostUsd: 2,
};

export const defaultReaderSummaryMaxEvidenceItems = 120;

export const readerSummaryPreferenceInterestId = (
  snapshot: ReturnType<ReaderSummaryJob["toSnapshot"]>,
): string =>
  snapshot.scope.type === "interest"
    ? snapshot.scope.interestId
    : "00000000-0000-7000-8000-000000000903";

export const safeBuildReaderSummaryContext = async (params: {
  readonly contextProvider: ReaderSummaryContextProviderPort;
  readonly snapshot: ReturnType<ReaderSummaryJob["toSnapshot"]>;
  readonly evidence: SummaryEvidenceSelection;
}): Promise<ReaderSummaryContextBuildResult> => {
  try {
    const artifacts = await params.contextProvider.buildContext({
      tenantId: params.snapshot.tenantId,
      workspaceId: params.snapshot.workspaceId,
      scope: params.snapshot.scope,
      period: params.snapshot.period,
      userId: params.snapshot.userId,
      subscriptionId: params.snapshot.subscriptionId,
      evidence: params.evidence,
      requestedAt: params.snapshot.requestedAt,
    });
    return { artifacts, unavailable: false };
  } catch {
    return { artifacts: [], unavailable: true };
  }
};

export const withReaderSummaryTopicMap = async (params: {
  readonly topicMapBuilder: BuildReaderSummaryTopicMapUseCase;
  readonly snapshot: ReturnType<ReaderSummaryJob["toSnapshot"]>;
  readonly evidence: SummaryEvidenceSelection;
  readonly draft: ReaderSummaryDraftWithContent;
}): Promise<Result<ReaderSummaryDraftWithContent, DomainError>> => {
  const primaryEvidence = primaryReaderSummaryEvidence(params.evidence);
  const topicMapResult = await params.topicMapBuilder.execute({
    tenantId: params.snapshot.tenantId,
    workspaceId: params.snapshot.workspaceId,
    scope: params.snapshot.scope,
    period: params.snapshot.period,
    requestedAt: params.snapshot.requestedAt,
    clusters: primaryEvidence.clusters,
    selectedEvidence: primaryEvidence.selectedEvidence,
    topStories: params.draft.topStories,
    citationMap: params.draft.citationMap,
  });
  if (!topicMapResult.ok) {
    return err(topicMapResult.error);
  }
  return ok({
    ...params.draft,
    content: { ...params.draft.content, topicMap: topicMapResult.value },
  });
};
