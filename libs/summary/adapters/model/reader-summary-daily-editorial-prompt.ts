import type { ReaderSummaryModelInput } from "../../ports";
import { buildOpenAiReaderSummaryPromptPayload } from "./openai-responses-reader-summary-prompt";
import { buildDailyEditorialPromptFromEvidence } from "./reader-summary-daily-editorial-evidence-binding";

// The provider prompt payload is untrusted; bind it only to the frozen manifest.
export function buildDailyEditorialPrompt(input: ReaderSummaryModelInput): string {
  const frozen = input.evidence.dailyGenerationInput;
  if (frozen === undefined || frozen.selected.length === 0) {
    throw new Error("Daily editorial planning requires frozen ordinary inputs");
  }
  // The ordinary evidence representation must stay byte-for-byte compatible
  // with the existing writer adapter and its source-hydration limits.
  const writerPayload = JSON.parse(buildOpenAiReaderSummaryPromptPayload(input)) as {
    evidence: readonly Record<string, unknown>[];
  };
  if (writerPayload.evidence.length !== frozen.selected.length) {
    throw new Error("Daily editorial evidence differs from the frozen input");
  }
  return buildDailyEditorialPromptFromEvidence(frozen, writerPayload.evidence);
}
