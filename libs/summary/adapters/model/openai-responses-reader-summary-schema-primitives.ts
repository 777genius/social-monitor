export function readerObjectSchema(
  required: readonly string[],
  properties: Record<string, unknown>,
) {
  return {
    type: "object",
    additionalProperties: false,
    required,
    properties,
  };
}

export function readerStringSchema(maxLength: number) {
  return { type: "string", maxLength };
}

export function readerStringArraySchema(maxItems = 10, maxLength = 160) {
  return { type: "array", items: readerStringSchema(maxLength), maxItems };
}
