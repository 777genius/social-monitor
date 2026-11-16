import type { AgentRuntimeTaskResult } from "../../ports";
import {
  mimoReaderSummaryBackend,
  type ReaderSummaryGenerationBackend,
} from "./active-reader-summary-generation-profile";

/**
 * Treat runtime schema and product-contract rejection as a rejected presentation,
 * not a retryable transport failure. Only the explicitly attested diagnostic
 * combinations are safe to absorb; all unknown failures remain fatal.
 */
export const runtimePresentationValidationRejection = (
  result: AgentRuntimeTaskResult,
  modelBackend: ReaderSummaryGenerationBackend,
): ReaderPostPresentationV3Result | undefined => {
  const failure = result.status === "failed" ? result.failure : undefined;
  if (failure && (failure.code === "unknown_runtime_failure" ||
      failure.code === "provider_output_invalid") &&
      ((failure.details?.outputValidationStage === "schema_normalization" &&
        failure.details?.outputValidationCode === "schema_normalization_failed") ||
       (modelBackend === mimoReaderSummaryBackend &&
        ((failure.details?.presentationValidationStage === "product_contract_rejected" &&
          failure.details?.presentationOutputValidatorCalled === "true" &&
          failure.details?.presentationOutputValidatorAccepted === "false") ||
         (failure.details?.presentationValidationStage === "schema_parse_or_normalization" &&
          failure.details?.presentationOutputValidatorCalled === "false" &&
          failure.details?.presentationOutputValidatorAccepted === "not_returned"))))) {
    const code = failure.details?.outputValidationCode === "schema_normalization_failed"
      ? "schema_normalization_failed" as const
      : failure.details?.presentationValidationStage === "product_contract_rejected"
        ? "product_contract_rejected" as const : "schema_parse_or_normalization" as const;
    return { status: "unavailable", reason: "invalid_presentation",
      validation: { stage: "runtime_output", code } };
  }
  return undefined;
};
