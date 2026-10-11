import { err, ok, DomainError, type Clock, type Result } from "@social-monitor/shared-kernel";
import { readerSummaryNewInputRefreshPrefix,
  type ReaderSummaryNewInputRefreshAuthority } from
  "../../application/contracts/reader-summary-new-input-refresh-authority";

import {
  type ReaderSummaryArtifact,
  type ReaderSummaryContextArtifact,
  type ReaderSummaryJob,
  type ReaderSummaryTopicMapEvidenceAdmission,
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

/** The numeric value is captured before the first await, so caller Date mutation
 * cannot change validation or later consumers. Explicit live boundaries have no
 * authority on refresh, V3, or recovery routes, including equal-looking values. */
export const validateReaderSummaryExecutionCutoff = (params: {
  readonly cutoffTime: number;
  readonly job: ReaderSummaryJob;
  readonly now: Date;
  readonly recoveryActive: boolean;
}): DomainError | undefined => {
  const snapshot = params.job.toSnapshot();
  if (snapshot.idempotencyKey.startsWith(readerSummaryNewInputRefreshPrefix) ||
      snapshot.selectionStrategy === "jev_primary_v3" || params.recoveryActive) {
    return new DomainError("operation.conflict",
      "Explicit live cutoff is unsupported on an authoritative refresh, V3 or recovery route");
  }
  const period = snapshot.period;
  const startedAt = period.startedAt.getTime();
  const endedAt = period.endedAt.getTime();
  const now = params.now.getTime();
  if (!Number.isFinite(params.cutoffTime) || !Number.isFinite(now) ||
      params.cutoffTime > now || period.cadence !== "daily" ||
      period.timezone !== "UTC" || startedAt % 86_400_000 !== 0 ||
      endedAt - startedAt !== 86_400_000 ||
      params.cutoffTime < startedAt || params.cutoffTime >= endedAt ||
      now < startedAt || now >= endedAt) {
    return new DomainError("validation.failed",
      "Explicit live cutoff requires a finite, non-future boundary in the current exact UTC daily period");
  }
  return undefined;
};

export const readerSummaryObservedThrough = async (params: {
  readonly job: ReaderSummaryJob;
  readonly authority?: ReaderSummaryNewInputRefreshAuthority;
  readonly clock: Clock;
}): Promise<Date | DomainError | undefined> => {
  const snapshot = params.job.toSnapshot();
  if (!snapshot.idempotencyKey.startsWith(readerSummaryNewInputRefreshPrefix)) {
    return undefined;
  }
  try {
    if (params.authority === undefined) throw new Error("missing authority");
    const observed = await params.authority.claim(snapshot);
    return Number.isFinite(observed.getTime()) &&
      observed.getTime() <= params.clock.now().getTime() ? observed :
      new DomainError("validation.failed",
        "Historical new-input refresh cutoff is invalid");
  } catch {
    return new DomainError("operation.conflict",
      "Historical new-input refresh requires reconciliation or valid authority");
  }
};

export const resolveReaderSummaryExecutionObservedThrough = async (params: {
  readonly cutoffTime?: number;
  readonly job: ReaderSummaryJob;
  readonly authority?: ReaderSummaryNewInputRefreshAuthority;
  readonly clock: Clock;
  readonly recoveryActive: boolean;
}): Promise<number | DomainError | undefined> => {
  if (params.cutoffTime !== undefined) {
    return validateReaderSummaryExecutionCutoff({ ...params,
      cutoffTime: params.cutoffTime, now: params.clock.now() }) ?? params.cutoffTime;
  }
  const observed = await readerSummaryObservedThrough(params);
  return observed instanceof DomainError ? observed : observed?.getTime();
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
    evidenceAdmission: topicMapEvidenceAdmission(
      params.snapshot.selectionStrategy,
      primaryEvidence,
    ),
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

const topicMapEvidenceAdmission = (
  selectionStrategy: ReturnType<ReaderSummaryJob["toSnapshot"]>["selectionStrategy"],
  evidence: SummaryEvidenceSelection,
): ReaderSummaryTopicMapEvidenceAdmission =>
  selectionStrategy === "jev_primary_v3"
    ? { selectionStrategy,
        admittedCandidateIds: [
          ...(evidence.promotionV3?.top ?? []),
          ...(evidence.promotionV3?.additional ?? []),
        ].map((candidate) => candidate.candidateId) }
    : { selectionStrategy: selectionStrategy ?? "legacy_v2" };
