import type { ReaderSummaryNewInputRefreshAuthority } from "../../application/contracts/reader-summary-new-input-refresh-authority";
import { resolveReaderSummaryExecutionObservedThrough } from "./execute-reader-summary-job-support";
import { DomainError, err, ok, type Clock, type Result } from "@social-monitor/shared-kernel";
import { readerSummaryFirstPublicationPrefix, type ReaderSummaryFirstPublicationAuthority } from "../../application/contracts/reader-summary-first-publication-authority";
import { canonicalReaderSummaryPreparationTimestamp, type ReaderSummaryJob, type ReaderSummaryJobProps, type SummaryEvidenceSelection } from "../../domain";
import type { ProviderReaderSummaryAttempt } from "../../ports";

export type FirstPublicationExecutionBoundary = Awaited<ReturnType<ReaderSummaryFirstPublicationAuthority["claim"]>>;

export async function claimFirstPublicationExecution(params: {
  job: ReaderSummaryJobProps; authority?: ReaderSummaryFirstPublicationAuthority;
  explicitCutoffTime?: number; incompatibleAuthority: boolean; clock: Clock;
}): Promise<Result<FirstPublicationExecutionBoundary | undefined, DomainError>> {
  if (!params.job.idempotencyKey.startsWith(readerSummaryFirstPublicationPrefix)) {
    return params.authority === undefined ? ok(undefined) : err(new DomainError("operation.conflict", "First publication authority cannot execute ordinary jobs"));
  }
  try {
    if (params.explicitCutoffTime !== undefined || params.authority === undefined || params.incompatibleAuthority ||
        params.job.selectionStrategy === "jev_primary_v3") {
      return err(new DomainError("operation.conflict", "First publication authority is missing or incompatible"));
    }
    const boundary = await params.authority.claim(params.job);
    const asof = boundary.observedThrough.getTime();
    if (!Number.isFinite(asof) || asof < params.job.period.endedAt.getTime() || asof > params.clock.now().getTime() ||
        boundary.providerCoverage !== "UNPROVEN" || !/^[0-9a-f]{64}$/u.test(boundary.manifestSha256) ||
        boundary.sourceIdentity !== `inventory-manifest:${boundary.manifestSha256}:${new Date(asof).toISOString()}`) {
      return err(new DomainError("validation.failed", "First publication inventory authority boundary is invalid"));
    }
    return ok({ ...boundary, observedThrough: new Date(asof) });
  } catch {
    return err(new DomainError("operation.conflict", "Historical first publication requires a validated, unconsumed day reservation"));
  }
}

export function withFirstPublicationInventoryQuality(
  draft: ProviderReaderSummaryAttempt["draft"], boundary: FirstPublicationExecutionBoundary | undefined,
): ProviderReaderSummaryAttempt["draft"] {
  if (boundary === undefined) return draft;
  return { ...draft, qualityFlags: [...new Set([...draft.qualityFlags, "partial_evidence" as const])],
    risksAndUnknowns: [...draft.risksAndUnknowns, {
      description: "This summary uses the available historical inventory. Collection and provider coverage have not been proven complete.",
      reason: "source_limit",
    }] };
}

export function failReaderSummaryProviderExecution(params: {
  job: ReaderSummaryJob; failedAt: Date; failureReason: string; terminalConsumed: boolean;
}): ReaderSummaryJob {
  return params.terminalConsumed
    ? params.job.failTerminal({ failedAt: params.failedAt, failureReason: params.failureReason,
        terminalFailureCode: "provider_execution_failed" })
    : params.job.fail({ failedAt: params.failedAt, failureReason: params.failureReason });
}

export function bindFirstPublicationEvidence(evidence: SummaryEvidenceSelection,
  boundary: FirstPublicationExecutionBoundary | undefined): Result<SummaryEvidenceSelection, DomainError> {
  if (boundary === undefined) return ok(evidence);
  if (evidence.sourceWindow.ingestionCutoff?.getTime() !== boundary.observedThrough.getTime() ||
      evidence.sourceWindow.windowId !== boundary.sourceIdentity) {
    return err(new DomainError("operation.conflict", "First publication selection cutoff or source identity drifted"));
  }
  return ok({ ...evidence, sourceWindow: { ...evidence.sourceWindow,
    exactIngestionCutoff: canonicalReaderSummaryPreparationTimestamp(boundary.observedThrough) } });
}

export async function resolveReaderSummaryAuthorityBoundary(params: {
  job: ReaderSummaryJob; authority?: ReaderSummaryFirstPublicationAuthority;
  refreshAuthority?: ReaderSummaryNewInputRefreshAuthority; explicitCutoffTime?: number;
  recoveryActive: boolean; clock: Clock;
}): Promise<Result<{ firstPublicationBoundary?: FirstPublicationExecutionBoundary; observed?: number }, DomainError>> {
  let firstPublicationBoundary: FirstPublicationExecutionBoundary | undefined;
  if (params.authority !== undefined || params.job.toSnapshot().idempotencyKey.startsWith(readerSummaryFirstPublicationPrefix)) {
    const claimed = await claimFirstPublicationExecution({ ...params, job: params.job.toSnapshot(),
      incompatibleAuthority: params.refreshAuthority !== undefined || params.recoveryActive });
    if (!claimed.ok) return claimed;
    firstPublicationBoundary = claimed.value;
  }
  // Ordinary LIVE/refresh/V3/recovery call the original resolver immediately,
  // preserving the original clock read before any additional asynchronous work.
  const observed = firstPublicationBoundary?.observedThrough.getTime() ?? await resolveReaderSummaryExecutionObservedThrough({
    cutoffTime: params.explicitCutoffTime, job: params.job, authority: params.refreshAuthority,
    clock: params.clock, recoveryActive: params.recoveryActive });
  return observed instanceof DomainError ? err(observed) : ok({ firstPublicationBoundary, observed });
}
