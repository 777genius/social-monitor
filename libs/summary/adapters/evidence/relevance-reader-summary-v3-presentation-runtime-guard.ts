import type { StructuredLogger } from "@social-monitor/platform-logging";

import type { PromotionPresentationBuilder, ReaderPostPresentationRuntimeFailure,
  ReaderPostPresentationV3Input, ReaderPostPresentationV3Result } from
  "../../domain/services/reader-post-presentation-v3";
import type { ReaderSummaryV3PromotionOutcome, ReaderSummaryV3PromotionPort } from "../../ports";

/** Back-to-back whole-batch runtime failures that mean the runtime itself is down. */
export const maxConsecutiveRuntimeFailedPresentationBatches = 2;
/**
 * Skipped candidates a run absorbs before the share limit applies. It covers
 * one whole four-candidate batch, so a single failed batch never stops a run.
 */
export const runtimeFailedPresentationAllowance = 4;
/** Larger shares look systemic, e.g. MiMo quota the runtime reports without a reason. */
export const maxRuntimeFailedPresentationShare = 0.25;

/**
 * One promotion run's view of the shared presentation builder. Skipped
 * batches are logged and remembered for disclosure, while repeated runtime
 * failures still fail the run as a dependency outage instead of spending the
 * remaining budget.
 */
export class PresentationRuntimeFailureGuard implements PromotionPresentationBuilder {
  private consecutiveFailedBatches = 0;
  private attempted = 0;
  private failed = 0;
  private lastFailure?: ReaderPostPresentationRuntimeFailure;

  constructor(
    private readonly presentation: PromotionPresentationBuilder,
    private readonly logger: StructuredLogger,
  ) {}

  get degraded(): boolean {
    return this.failed > 0;
  }

  /** Last skipped runtime code, for operator-facing failure reasons. */
  get lastFailureCode(): string {
    return this.lastFailure?.code ?? "unclassified";
  }

  async build(inputs: readonly ReaderPostPresentationV3Input[]):
  Promise<readonly ReaderPostPresentationV3Result[]> {
    const results = await this.presentation.build(inputs);
    let failed = 0;
    for (const result of results) {
      if (result.status !== "unavailable" || result.reason !== "runtime_failure") continue;
      failed += 1;
      this.lastFailure = result.runtimeFailure;
    }
    this.attempted += results.length;
    this.failed += failed;
    this.consecutiveFailedBatches = failed > 0 && failed === results.length
      ? this.consecutiveFailedBatches + 1 : 0;
    const stop = this.consecutiveFailedBatches >= maxConsecutiveRuntimeFailedPresentationBatches ||
      this.failed > Math.max(runtimeFailedPresentationAllowance,
        this.attempted * maxRuntimeFailedPresentationShare);
    if (failed > 0) {
      const fields = { attempted: this.attempted, failed: this.failed, batchFailed: failed,
        consecutiveFailedBatches: this.consecutiveFailedBatches,
        lastCode: this.lastFailureCode,
        lastCauseCategory: this.lastFailure?.causeCategory ?? "unclassified" };
      if (stop) {
        this.logger.error("reader summary presentation stopped after repeated runtime failures", fields);
      } else {
        this.logger.warn("reader summary presentation skipped a runtime-failed batch", fields);
      }
    }
    if (stop) throw new Error(`presentation_runtime_failure_repeated:${this.lastFailureCode}`);
    return results;
  }
}

/**
 * Gives every promotion run a fresh guard, so failure counts never leak between
 * jobs sharing one builder. Ready evidence discloses skipped stories; a run the
 * skips left without a publishable slate reports the runtime as the cause.
 */
export class PresentationRuntimeGuardedPromotion implements ReaderSummaryV3PromotionPort {
  constructor(
    private readonly presentation: PromotionPresentationBuilder,
    private readonly promotionWith: (
      presentation: PromotionPresentationBuilder,
    ) => ReaderSummaryV3PromotionPort,
    private readonly logger: StructuredLogger,
  ) {}

  async build(params: Parameters<ReaderSummaryV3PromotionPort["build"]>[0]):
  Promise<ReaderSummaryV3PromotionOutcome> {
    const guard = new PresentationRuntimeFailureGuard(this.presentation, this.logger);
    const outcome = await this.promotionWith(guard).build(params);
    if (!guard.degraded) return outcome;
    if (outcome.kind === "ready") {
      return { ...outcome, evidence: { ...outcome.evidence, presentationRuntimeDegraded: true } };
    }
    return outcome.kind === "presentation_unavailable" || outcome.kind === "budget_exhausted"
      ? { kind: "dependency_failure", reason: `presentation_runtime_failure:${guard.lastFailureCode}` }
      : outcome;
  }
}
