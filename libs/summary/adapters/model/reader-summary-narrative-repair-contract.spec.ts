import {
  isRepairableNarrativeError as legacyRepairableError,
  readerSummaryRepairInstruction as legacyRepairInstruction,
} from "./reader-summary-narrative-repair-contract";
import { isRepairableNarrativeError } from "./reader-summary-narrative-repair-eligibility";
import { readerSummaryRepairInstruction } from "./reader-summary-narrative-repair-instructions";

// Pinned pre-refactor literal: exact prompt bytes are part of the model contract.
const originalLegacyInstruction =
  "Repair the complete JSON response. Every narrativeSections item must use the non-empty string fields title and text, never summary, body or description. If coveragePlan.lead is null, return empty topStories and narrativeSections plus a concrete noSignalReason. For single_story, narrativeSections[0] must have kind lead and cite coveragePlan.lead. For daily_synthesis, it must have kind lead, set storyClusterId to null, and cite both coveragePlan.lead and at least one coveragePlan.secondary cluster. Return exactly one secondary_signal for every coveragePlan.secondary entry. Omit any watch that is not self-contained and backed by high engagement, first-party authority or cross-provider support. Do not change facts or invent citations.";
const originalDailyInstruction = "Repair the complete JSON using one synthesis lead and zero to five cross-cutting secondary_signal takeaways (usually three to five). narrativeSections must have 1–6 entries total, never one entry per editorial topic. Set narrativeSections[0].kind to lead and every later kind to secondary_signal. Set every narrativeSections storyClusterId to null. Copy distinct citationIds exactly from the schema enum. Cite assigned sources from at least two distinct original stories when available, with complete text paragraphs under 1600 characters. Preserve the planned topStories cards and their source-local bindings; do not invent facts, citations or connections.";
const originalSchemaInstruction = (violations: readonly string[]): string =>
  `Your previous response was rejected by the output schema at: ${violations.join("; ")}. Each entry is path:rule, with the limit after = (maxLength in characters, maxItems in items). Regenerate the complete JSON response from the same evidence. Rewrite every listed field as complete, shorter text inside its limit; never cut a sentence or word, and keep every other field inside the hard limits. Do not change facts or invent citations.`;

const daily = Object.freeze({ dailyEditorialPlan: Object.freeze({ version: "reader_summary.daily_editorial.v2" }) });
const legacy = Object.freeze({ dailyEditorialPlan: Object.freeze({ version: "reader_summary.daily_editorial.v1" }) });

it("preserves historical export function identity and exact legacy/daily instructions", () => {
  expect(legacyRepairableError).toBe(isRepairableNarrativeError);
  expect(legacyRepairInstruction).toBe(readerSummaryRepairInstruction);
  expect(readerSummaryRepairInstruction({})).toBe(originalLegacyInstruction);
  expect(readerSummaryRepairInstruction(legacy)).toBe(originalLegacyInstruction);
  expect(readerSummaryRepairInstruction(daily)).toBe(originalDailyInstruction);
});

it("retains exact schema violation instructions, ordering and v2 synthesis suffix", () => {
  const violations = Object.freeze(["$.headline:maxLength=160", "$.sections:maxItems=6"]);
  const preamble = originalSchemaInstruction(violations);
  expect(readerSummaryRepairInstruction({}, violations)).toBe(preamble);
  expect(readerSummaryRepairInstruction(legacy, violations)).toBe(preamble);
  expect(readerSummaryRepairInstruction(daily, violations)).toBe(`${preamble}\n${originalDailyInstruction}`);
  expect(readerSummaryRepairInstruction(daily, Object.freeze([]))).toBe(`${originalSchemaInstruction([])}\n${originalDailyInstruction}`);
  expect(violations).toEqual(["$.headline:maxLength=160", "$.sections:maxItems=6"]);
});

it.each([
  "Reader summary narrative invalid",
  "Daily editorial narrative invalid",
  "Daily editorial story invalid",
  "Daily editorial stories invalid",
  "Daily editorial synthesis invalid",
])("adopts only the existing repairable narrative error prefixes: %s", (message) => {
  expect(isRepairableNarrativeError(new Error(message))).toBe(true);
});

it("fails closed for unrelated errors, non-Error values and mismatched prefixes", () => {
  for (const value of [undefined, null, "Reader summary narrative invalid", {},
    new Error("Provider timeout"), new Error("not Reader summary narrative"),
    new Error("Daily editorial plan invalid"), new Error("daily editorial story invalid")]) {
    expect(isRepairableNarrativeError(value)).toBe(false);
  }
});
