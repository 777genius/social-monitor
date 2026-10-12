import { readerPostPresentationCandidates, readerPostPresentationV3OutputSchema,
  validReaderPostPresentationProposals } from "@social-monitor/summary/domain";
import { canonicalPromotionPayload } from "@social-monitor/summary/domain/services/reader-post-promotion-attestation";

/** Source-owned composition only. Request data cannot opt another purpose into native Goal completion. */
export const createMimoPresentationCompletionValidator = (input: {
  readonly purpose: string; readonly provider: string; readonly model: string;
  readonly modelBackend: string; readonly reasoningEffort: string;
  readonly task: { readonly prompt: unknown; readonly outputSchemaName: unknown; readonly controls: unknown };
}): ((output: unknown) => boolean) => {
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
      values.reasoningEffort !== input.reasoningEffort || typeof input.task.prompt !== "string" ||
      canonicalPromotionPayload(values.outputSchema) !== canonicalPromotionPayload(readerPostPresentationV3OutputSchema)) {
    throw new Error("MiMo presentation completion contract is invalid");
  }
  const candidates = readerPostPresentationCandidates(input.task.prompt);
  return output => validReaderPostPresentationProposals(output, candidates);
};
