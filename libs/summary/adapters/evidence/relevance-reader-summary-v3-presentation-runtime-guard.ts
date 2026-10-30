import type { PromotionPresentationBuilder, ReaderPostPresentationV3Input,
  ReaderPostPresentationV3Result } from "../../domain/services/reader-post-presentation-v3";
import type { ReaderSummaryV3PromotionOutcome, ReaderSummaryV3PromotionPort } from "../../ports";

/** Back-to-back whole-batch runtime failures that mean the runtime itself is down. */
export const maxConsecutiveRuntimeFailedPresentationBatches = 2;
/**
 * Skipped candidates a run absorbs before the share limit applies. It covers
 * one whole four-candidate batch, so a single failed batch never stops a run.
 */
export const runtimeFailedPresentationAllowance = 4;
/** Larger shares look systemic, e.g. intermittent quota the runtime did not classify. */
export const maxRuntimeFailedPresentationShare = 0.25;

/**
 * One promotion run's view of the shared presentation builder. Skipped
 * batches are remembered for disclosure, while repeated runtime failures still
 * fail the run as a dependency outage instead of spending the remaining budget.
 */
export class PresentationRuntimeFailureGuard implements PromotionPresentationBuilder {
  private consecutiveFailedBatches = 0;
  private attempted = 0;
  private failed = 0;

  constructor(private readonly presentation: PromotionPresentationBuilder) {}

  get degraded(): boolean {
    return this.failed > 0;
  }

  async build(inputs: readonly ReaderPostPresentationV3Input[]):
  Promise<readonly ReaderPostPresentationV3Result[]> {
    const results = await this.presentation.build(inputs);
    const failed = results.filter((result) =>
      result.status === "unavailable" && result.reason === "runtime_failure").length;
    this.attempted += results.length;
    this.failed += failed;
    this.consecutiveFailedBatches = failed > 0 && failed === results.length
      ? this.consecutiveFailedBatches + 1 : 0;
    if (this.consecutiveFailedBatches >= maxConsecutiveRuntimeFailedPresentationBatches ||
        this.failed > Math.max(runtimeFailedPresentationAllowance,
          this.attempted * maxRuntimeFailedPresentationShare)) {
      throw new Error("presentation_runtime_failure_repeated");
    }
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
  ) {}

  async build(params: Parameters<ReaderSummaryV3PromotionPort["build"]>[0]):
  Promise<ReaderSummaryV3PromotionOutcome> {
    const guard = new PresentationRuntimeFailureGuard(this.presentation);
    const outcome = await this.promotionWith(guard).build(params);
    if (!guard.degraded) return outcome;
    if (outcome.kind === "ready") {
      return { ...outcome, evidence: { ...outcome.evidence, presentationRuntimeDegraded: true } };
    }
    return outcome.kind === "presentation_unavailable" || outcome.kind === "budget_exhausted"
      ? { kind: "dependency_failure", reason: "presentation_runtime_failure" }
      : outcome;
  }
}
