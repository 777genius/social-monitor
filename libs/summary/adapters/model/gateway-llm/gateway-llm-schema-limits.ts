import { collectGatewaySchemaLimits } from "./gateway-llm-schema-limit-collector";
export { promptLengthShare } from "./gateway-llm-schema-limit-collector";

/**
 * A "Hard limits" prompt block derived from an output schema: every prose
 * maxLength (with headroom), every item count, and the arrays that must stay
 * empty. Paths use [] for "every item".
 */
export const gatewayOutputHardLimits = (schema: Record<string, unknown>): string => {
  const { lines, empty } = collectGatewaySchemaLimits(schema);
  return [
    "Hard limits. They override any longer length guidance above, and the response is rejected when any of them is exceeded. Stay inside them by writing complete, shorter sentences; never cut a sentence or word to fit.",
    ...lines,
    ...(empty.length === 0 ? [] : [`- always empty arrays: ${empty.join(", ")}`]),
  ].join("\n");
};
