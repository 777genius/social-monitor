/**
 * OpenAI Reader Summary wire envelope. This is deliberately provider-specific:
 * the adapter owns admission, credentials, transport and response validation;
 * the wire contract owns retention and strict schema serialization.
 */
export const buildOpenAiReaderSummaryResponseRequest = (params: {
  readonly model: string;
  readonly maxOutputTokens: number;
  readonly instructions: string;
  readonly prompt: string;
  readonly schema: Record<string, unknown>;
}): Record<string, unknown> => ({
  model: params.model,
  store: false,
  max_output_tokens: params.maxOutputTokens,
  instructions: params.instructions,
  input: params.prompt,
  text: {
    format: {
      type: "json_schema",
      name: "social_monitor_reader_summary_artifact",
      strict: true,
      schema: params.schema,
    },
  },
});
