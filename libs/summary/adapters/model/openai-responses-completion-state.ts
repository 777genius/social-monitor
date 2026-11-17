/** Pure fail-closed admission for paid non-streaming OpenAI Responses output.
 * Never embed untrusted provider values in error messages or logs.
 * Historical synthetic responses without a status remain eligible.
 */
export type OpenAiResponsesCompletionIssue = "not_completed" | "error" | "refusal";

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
const present = (value: unknown): boolean => value !== null && value !== undefined;

export const openAiResponsesCompletionIssue = (
  response: Readonly<Record<string, unknown>>,
): OpenAiResponsesCompletionIssue | null => {
  if (response.status !== undefined && response.status !== "completed") return "not_completed";
  if (present(response.error)) return "error";
  if (present(response.incomplete_details)) return "not_completed";
  if (present(response.refusal)) return "refusal";
  // A present but malformed output envelope cannot be rescued by aggregate
  // output_text: the conflicting provider structure is still untrusted.
  if (response.output !== undefined && !Array.isArray(response.output)) return "not_completed";
  const fragments: string[] = [];

  for (const rawOutput of Array.isArray(response.output) ? response.output : []) {
    const output = record(rawOutput);
    if (output === undefined) continue;
    if (output.type === "error" || present(output.error)) return "error";
    if (output.type === "refusal" || present(output.refusal)) return "refusal";
    if (output.status !== undefined && output.status !== "completed") return "not_completed";
    if (present(output.incomplete_details)) return "not_completed";
    if (output.content !== undefined && !Array.isArray(output.content)) return "not_completed";
    for (const rawContent of Array.isArray(output.content) ? output.content : []) {
      const content = record(rawContent);
      if (content === undefined) continue;
      if (content.type === "error" || present(content.error)) return "error";
      if (content.type === "refusal" || present(content.refusal)) return "refusal";
      if (content.type === "output_text") {
        if (typeof content.text !== "string" || content.text.trim().length === 0) {
          return "not_completed";
        }
        fragments.push(content.text);
      }
    }
  }
  // An explicit completed response cannot present contradictory JSON payloads.
  // The strict summary schema produces one output_text item, never stitched text.
  if (response.status === "completed") {
    if (fragments.length > 1) return "not_completed";
    if (fragments.length === 1 && typeof response.output_text === "string" &&
        response.output_text.trim().length > 0 &&
        fragments[0] !== response.output_text) return "not_completed";
  }
  return null;
};
