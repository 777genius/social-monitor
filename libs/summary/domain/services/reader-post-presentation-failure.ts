/** Closed operator codes only; never source text, generated text or errors. */
const stages = ["runtime_output", "source_copy_decode", "proposal_contract",
  "headline_seal"] as const;
const codes = ["schema_normalization_failed", "product_contract_rejected",
  "schema_parse_or_normalization", "proposal_cardinality", "proposal_shape_or_identity",
  "proposal_fields", "proposal_missing_or_invalid", "headline_binding", "headline_status",
  "content_shape", "display_text", "confidence", "source_envelope", "source_reference",
  "qualification", "quote_budget", "qualification_judgment", "subject_label"] as const;

export type ReaderPostPresentationFailureDetail = {
  readonly stage: typeof stages[number];
  readonly code: typeof codes[number];
};

export const readReaderPostPresentationFailureDetail = (
  value: unknown,
): ReaderPostPresentationFailureDetail | undefined => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join(",") !== "code,stage" ||
      !stages.includes(row.stage as typeof stages[number]) ||
      !codes.includes(row.code as typeof codes[number])) return undefined;
  return { stage: row.stage as ReaderPostPresentationFailureDetail["stage"],
    code: row.code as ReaderPostPresentationFailureDetail["code"] };
};
