/** CLI failure metadata is untrusted. Preserve finite diagnostics, never output or exception text. */
const admittedValues: Readonly<Record<string, readonly string[]>> = {
  outputValidationStage: ["structured_parse", "schema_normalization", "product_validator", "unknown_validator"],
  outputValidationCode: ["structured_parse_failed", "schema_normalization_failed",
    "product_validator_rejected", "product_validator_exception", "validator_exception"],
  outputValidationKeyword: ["type", "required", "additionalProperties", "enum", "const",
    "minItems", "maxItems", "uniqueItems", "minLength", "maxLength", "pattern", "minimum",
    "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "anyOf", "oneOf"],
  presentationValidationStage: ["schema_parse_or_normalization", "product_contract_rejected", "product_validator_exception"],
  presentationOutputValidatorCalled: ["true", "false"],
  presentationOutputValidatorAccepted: ["true", "false", "not_returned"],
  presentationRejectedPredicate: ["content_shape", "display_text", "confidence", "source_envelope",
    "source_reference", "qualification", "quote_budget", "qualification_judgment", "subject_label",
    "proposal_cardinality", "proposal_shape_or_identity", "proposal_fields"],
  presentationRejectedCandidateIndex: ["0", "1", "2", "3"],
};

export const readRuntimeOutputFailureDiagnostics = (
  value: unknown,
): Readonly<Record<string, string>> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string" &&
      Object.hasOwn(admittedValues, entry[0]) && admittedValues[entry[0]]!.includes(entry[1]),
  ));
};
