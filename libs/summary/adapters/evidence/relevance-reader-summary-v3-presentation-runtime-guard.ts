import type { ReaderPostPromotionV3Selection } from "../../domain";
import type { PromotionPresentationBuilder, ReaderPostPresentationV3Input,
  ReaderPostPresentationV3Result } from "../../domain/services/reader-post-presentation-v3";

/** Back-to-back whole-batch runtime failures that mean the runtime itself is down. */
export const maxConsecutiveRuntimeFailedPresentationBatches = 2;

/**
 * One promotion job's view of the shared presentation builder. A batch the
 * runtime failed is skipped and later disclosed on the selection, while
 * repeated whole-batch failures still fail the job as a dependency outage
 * instead of spending the remaining budget against it.
 */
export class PresentationRuntimeFailureGuard implements PromotionPresentationBuilder {
  private consecutiveFailedBatches = 0;
  private degraded = false;

  constructor(private readonly presentation: PromotionPresentationBuilder) {}

  async build(inputs: readonly ReaderPostPresentationV3Input[]):
  Promise<readonly ReaderPostPresentationV3Result[]> {
    const results = await this.presentation.build(inputs);
    const failed = results.filter((result) =>
      result.status === "unavailable" && result.reason === "runtime_failure").length;
    this.degraded ||= failed > 0;
    this.consecutiveFailedBatches = failed > 0 && failed === results.length
      ? this.consecutiveFailedBatches + 1 : 0;
    if (this.consecutiveFailedBatches >= maxConsecutiveRuntimeFailedPresentationBatches) {
      throw new Error("presentation_runtime_failure_repeated");
    }
    return results;
  }

  disclose(selection: ReaderPostPromotionV3Selection): ReaderPostPromotionV3Selection {
    return this.degraded
      ? Object.freeze({ ...selection, presentationRuntimeDegraded: true as const })
      : selection;
  }
}
