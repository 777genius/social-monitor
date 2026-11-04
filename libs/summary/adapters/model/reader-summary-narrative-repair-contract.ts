const narrativeRepairInstruction =
  "Repair the complete JSON response. Every narrativeSections item must use the non-empty string fields title and text, never summary, body or description. If coveragePlan.lead is null, return empty topStories and narrativeSections plus a concrete noSignalReason. For single_story, narrativeSections[0] must have kind lead and cite coveragePlan.lead. For daily_synthesis, it must have kind lead, set storyClusterId to null, and cite both coveragePlan.lead and at least one coveragePlan.secondary cluster. Return exactly one secondary_signal for every coveragePlan.secondary entry. Omit any watch that is not self-contained and backed by high engagement, first-party authority or cross-provider support. Do not change facts or invent citations.";

const schemaRepairInstruction = (violations: readonly string[]): string =>
  `Your previous response was rejected by the output schema at: ${violations.join("; ")}. Each entry is path:rule, with the limit after = (maxLength in characters, maxItems in items). Regenerate the complete JSON response from the same evidence. Rewrite every listed field as complete, shorter text inside its limit; never cut a sentence or word, and keep every other field inside the hard limits. Do not change facts or invent citations.`;

export const isRepairableNarrativeError = (error: unknown): boolean =>
  error instanceof Error && ["Reader summary narrative", "Daily editorial narrative",
    "Daily editorial story", "Daily editorial stories", "Daily editorial synthesis"].some(prefix => error.message.startsWith(prefix));

/** Reuse the same v2 contract for the one budgeted repair; do not restore per-topic prose. */
export function readerSummaryRepairInstruction(input: {readonly dailyEditorialPlan?: {readonly version:string}}, violations?:readonly string[]):string {
  if (input.dailyEditorialPlan?.version !== "reader_summary.daily_editorial.v2") return violations === undefined ? narrativeRepairInstruction : schemaRepairInstruction(violations);
  const shape = "Repair the complete JSON using one synthesis lead and zero to five cross-cutting secondary_signal takeaways (usually three to five). narrativeSections must have 1–6 entries total, never one entry per editorial topic. Set every storyClusterId to null. Cite assigned sources from at least two distinct original stories when available, with complete text paragraphs under 1600 characters. Preserve the planned topStories cards and their source-local bindings; do not invent facts, citations or connections.";
  return violations === undefined ? shape : `${schemaRepairInstruction(violations)}\n${shape}`;
}
