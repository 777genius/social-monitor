import { readerPostPresentationCandidates, readerPostPresentationCatalogOutputSchema,
  readerPostPresentationCatalogProposalFailure } from "@social-monitor/summary/domain";
import { canonicalPromotionPayload } from "@social-monitor/summary/domain/services/reader-post-promotion-attestation";
import { readRuntimeOutputFailureDiagnostics } from "./runtime-output-failure-diagnostics";

interface CompletionObservation {
  called: boolean;
  accepted?: boolean;
  rejectionCode?: string;
  rejectedIndex?: number;
}
export interface MimoPresentationCompletionValidator {
  (output: unknown): boolean;
  /** Only bounded phase flags; source/output/credential bytes never enter failure details. */
  failureDetails(failure: unknown): Readonly<Record<string, string>>;
}
const rejectionCode = "codex_goal_completed_output_rejected";
function completionFailureDetails(failure: unknown, observation: CompletionObservation): Readonly<Record<string, string>> {
  if (failure === null || typeof failure !== "object") return {};
  const value = failure as { failureDetails?: { rawCause?: unknown }; details?: { rawCause?: unknown }; message?: unknown };
  const diagnostics = Object.fromEntries(Object.entries({ ...readRuntimeOutputFailureDiagnostics(value.details),
    ...readRuntimeOutputFailureDiagnostics(value.failureDetails) })
    .filter(([name]) => ["outputValidationStage", "outputValidationCode", "outputValidationKeyword"].includes(name)));
  if (value.failureDetails?.rawCause !== rejectionCode && value.details?.rawCause !== rejectionCode &&
      value.message !== rejectionCode) return diagnostics;
  return {
    ...diagnostics,
    presentationValidationStage: !observation.called ? "schema_parse_or_normalization" :
      observation.accepted === false ? "product_contract_rejected" : "product_validator_exception",
    presentationOutputValidatorCalled: String(observation.called),
    presentationOutputValidatorAccepted: observation.accepted === undefined ? "not_returned" : String(observation.accepted),
    ...(observation.rejectionCode === undefined ? {} : { presentationRejectedPredicate: observation.rejectionCode }),
    ...(observation.rejectedIndex === undefined ? {} : { presentationRejectedCandidateIndex: String(observation.rejectedIndex) }),
  };
}

/** Source-owned composition only. Request data cannot opt another purpose into native Goal completion. */
export const createMimoPresentationCompletionValidator = (input: {
  readonly purpose: string; readonly provider: string; readonly model: string;
  readonly modelBackend: string; readonly reasoningEffort: string;
  readonly task: { readonly prompt: unknown; readonly outputSchemaName: unknown; readonly controls: unknown };
}): MimoPresentationCompletionValidator => {
  const controls = input.task.controls;
  if (input.purpose !== "social_monitor.reader_summary.promotion_presentation.v3" ||
      input.provider !== "codex" || input.model !== "mimo-v2.6-pro" ||
      input.modelBackend !== "xiaomi-mimo-token-plan" || input.reasoningEffort !== "none" ||
      controls === null || typeof controls !== "object" || Array.isArray(controls)) {
    throw new Error("MiMo presentation completion profile is invalid");
  }
  const values = controls as Record<string, unknown>;
  if (input.task.outputSchemaName !== "social_monitor_reader_post_presentation_v3" ||
      values.outputSchemaName !== input.task.outputSchemaName || values.schemaVersion !== "reader_post_presentation.v3" ||
      values.model !== input.model || values.modelBackend !== input.modelBackend ||
      values.reasoningEffort !== input.reasoningEffort || typeof input.task.prompt !== "string") {
    throw new Error("MiMo presentation completion contract is invalid");
  }
  const candidates = readerPostPresentationCandidates(input.task.prompt);
  if (canonicalPromotionPayload(values.outputSchema) !== canonicalPromotionPayload(readerPostPresentationCatalogOutputSchema(candidates))) {
    throw new Error("MiMo presentation completion contract is invalid");
  }
  const observation: CompletionObservation = { called: false };
  return Object.assign((output: unknown): boolean => {
    observation.called = true;
    const rejection = readerPostPresentationCatalogProposalFailure(output, candidates);
    const accepted = rejection === null;
    observation.rejectionCode = rejection?.code;
    observation.rejectedIndex = rejection?.index;
    observation.accepted = accepted;
    return accepted;
  }, { failureDetails: (failure: unknown) => completionFailureDetails(failure, observation) });
};
