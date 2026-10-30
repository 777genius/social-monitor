import type { PromotionPresentationBuilder, ReaderPostPresentationV3Input,
  ReaderPostPresentationV3Result } from "../../domain/services/reader-post-presentation-v3";
import type { ReaderSummaryV3PromotionOutcome, ReaderSummaryV3PromotionPort } from "../../ports";

/** Back-to-back whole-batch runtime failures that mean the runtime itself is down. */
export const maxConsecutiveRuntimeFailedPresentationBatches = 2;

/**
 * One promotion run's view of the shared presentation builder. A batch the
 * runtime failed is skipped and remembered for disclosure, while repeated
 * whole-batch failures still fail the run as a dependency outage instead of
 * spending the remaining budget against it.
 */
export class PresentationRuntimeFailureGuard implements PromotionPresentationBuilder {
  private consecutiveFailedBatches = 0;
  private skipped = false;

  constructor(private readonly presentation: PromotionPresentationBuilder) {}

  get degraded(): boolean {
    return this.skipped;
  }

  async build(inputs: readonly ReaderPostPresentationV3Input[]):
  Promise<readonly ReaderPostPresentationV3Result[]> {
    const results = await this.presentation.build(inputs);
    const failed = results.filter((result) =>
      result.status === "unavailable" && result.reason === "runtime_failure").length;
    this.skipped ||= failed > 0;
    this.consecutiveFailedBatches = failed > 0 && failed === results.length
      ? this.consecutiveFailedBatches + 1 : 0;
    if (this.consecutiveFailedBatches >= maxConsecutiveRuntimeFailedPresentationBatches) {
      throw new Error("presentation_runtime_failure_repeated");
    }
    return results;
  }
}

/**
 * Gives every promotion run a fresh guard, so failure counts never leak between
 * jobs sharing one builder, and discloses skipped stories on ready evidence.
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
    return outcome.kind === "ready" && guard.degraded
      ? { ...outcome, evidence: { ...outcome.evidence, presentationRuntimeDegraded: true } }
      : outcome;
  }
}
