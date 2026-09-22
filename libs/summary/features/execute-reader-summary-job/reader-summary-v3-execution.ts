import { DomainError, type Clock } from "@social-monitor/shared-kernel";
import type { ReaderSummaryJob, ReaderSummaryPreparationManifest,
  SummaryEvidenceSelection } from "../../domain";
import { canonicalReaderSummaryPreparationTimestamp } from "../../domain";
import type { ReaderSummaryJobRepositoryPort, ReaderSummaryV3PreflightPort,
  ReaderSummaryV3PromotionPort } from "../../ports";
import type { ExecuteReaderSummaryJobResult } from "./execute-reader-summary-job.result";
import { saveReaderSummaryExecutionOutcome } from "./reader-summary-job-execution";

export type ReaderSummaryV3PreparationOutcome =
  | { readonly kind: "run"; readonly job: ReaderSummaryJob;
      readonly manifest: ReaderSummaryPreparationManifest }
  | { readonly kind: "result"; readonly value: ExecuteReaderSummaryJobResult }
  | { readonly kind: "error"; readonly error: DomainError };

export const prepareReaderSummaryV3Job = async (params: {
  readonly job: ReaderSummaryJob;
  readonly preflight?: ReaderSummaryV3PreflightPort;
  readonly clock: Clock;
}): Promise<ReaderSummaryV3PreparationOutcome> => {
  if (params.preflight === undefined) return { kind: "error",
    error: new DomainError("operation.conflict",
      "Jev primary summary preparation is not configured") };
  const outcome = await params.preflight.advance({ job: params.job,
    requestedAt: params.clock.now(), startedAt: params.clock.now() });
  if (outcome.kind === "deferred" || outcome.kind === "terminal") {
    const snapshot = outcome.job.toSnapshot();
    return { kind: "result", value: { readerSummaryJobId: snapshot.id,
      status: snapshot.status, readerSummaryId: snapshot.readerSummaryId } };
  }
  if (outcome.kind === "already_running") {
    return { kind: "result", value: { readerSummaryJobId:
      outcome.job.toSnapshot().id, status: "running" } };
  }
  return { kind: "run", job: outcome.job, manifest: outcome.manifest };
};

export type ReaderSummaryV3EvidenceOutcome =
  | { readonly kind: "evidence"; readonly evidence: SummaryEvidenceSelection }
  | { readonly kind: "result"; readonly value: ExecuteReaderSummaryJobResult }
  | { readonly kind: "error"; readonly error: DomainError };

export const buildReaderSummaryV3Evidence = async (params: {
  readonly job: ReaderSummaryJob;
  readonly manifest: ReaderSummaryPreparationManifest;
  readonly promotion?: ReaderSummaryV3PromotionPort;
  readonly jobs: ReaderSummaryJobRepositoryPort;
  readonly clock: Clock;
  readonly claimStartedAt: Date;
}): Promise<ReaderSummaryV3EvidenceOutcome> => {
  if (params.promotion === undefined) return { kind: "error",
    error: new DomainError("operation.conflict",
      "Jev primary promotion presentation is not configured") };
  const promotion = await params.promotion.build({ job: params.job,
    manifest: params.manifest });
  if (promotion.kind === "ready") return { kind: "evidence",
    evidence: promotion.evidence };
  if (promotion.kind === "no_signal") return { kind: "evidence",
    evidence: emptyV3Evidence(params.job, params.manifest) };
  const code = promotion.kind === "dependency_failure"
    ? "presentation_dependency_unavailable" as const
    : "presentation_unavailable" as const;
  const failed = params.job.failTerminal({ failedAt: params.clock.now(),
    failureReason: promotion.kind === "dependency_failure"
      ? promotion.reason : promotion.kind, terminalFailureCode: code });
  if (!(await saveReaderSummaryExecutionOutcome(params.jobs, failed,
    params.claimStartedAt))) {
    return { kind: "error", error: new DomainError("operation.conflict",
      "Reader summary execution fence was lost") };
  }
  return { kind: "result", value: { readerSummaryJobId: failed.toSnapshot().id,
    status: "failed" } };
};

const emptyV3Evidence = (job: ReaderSummaryJob,
  manifest: ReaderSummaryPreparationManifest): SummaryEvidenceSelection => {
  const snapshot = job.toSnapshot();
  const exactCutoff = canonicalReaderSummaryPreparationTimestamp(manifest.cutoffAt);
  return { rankingPolicyVersion: "reader_promotion_policy.v3",
    sourceWindow: { windowId: `reader-summary-v3:${snapshot.id}`,
      startedAt: snapshot.period.startedAt, endedAt: snapshot.period.endedAt,
      selectedFeedItemIds: [], storyClusterIds: [],
      periodStartedAt: snapshot.period.startedAt,
      periodEndedAt: snapshot.period.endedAt,
      ingestionCutoff: new Date(exactCutoff),
      exactIngestionCutoff: exactCutoff },
    clusters: [], selectedEvidence: [], promotionV3: {
      policyVersion: "reader_promotion_policy.v3", outcome: "no_signal",
      top: [], additional: [], excluded: [] } };
};
