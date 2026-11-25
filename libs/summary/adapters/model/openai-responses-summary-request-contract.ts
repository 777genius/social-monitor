import type { SummaryModelInput } from "../../ports";
import { buildInstructions } from "./openai-responses-summary-prompt";
import { buildPromptPayload } from "./openai-responses-summary-evidence-payload";
import { openAiSummaryJsonSchema } from "./openai-responses-summary-schema";

/** Construct only the provider wire contract; no dispatch, credentials or response acceptance. */
export const buildOpenAiSummaryRequest = (
  input: SummaryModelInput,
  model: string,
  maxOutputTokens: number,
): Record<string, unknown> => ({
  model,
  store: false,
  max_output_tokens: maxOutputTokens,
  instructions: buildInstructions(input),
  input: buildPromptPayload(input),
  text: {
    format: {
      type: "json_schema",
      name: "social_monitor_summary_artifact",
      strict: true,
      schema: openAiSummaryJsonSchema,
    },
  },
});
