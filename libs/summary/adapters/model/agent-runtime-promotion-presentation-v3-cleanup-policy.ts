import type { ReaderPostPresentationV3Result } from "../../domain/services/reader-post-presentation-v3";
import type { AgentRuntimeTaskResult } from "../../ports";

/** Project a verified cleanup-pending signal onto every outcome in one batch. */
export const projectPromotionPresentationCleanup = (result: AgentRuntimeTaskResult) => {
  const cleanupPending = result.warnings.some(warning => warning.code === "gateway_cleanup_pending") ||
    result.failure?.details?.gatewayCleanup === "pending";
  const withCleanup = (value: ReaderPostPresentationV3Result): ReaderPostPresentationV3Result =>
    cleanupPending ? { ...value, cleanupPending: true } : value;
  return withCleanup;
};
