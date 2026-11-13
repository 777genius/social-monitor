import {
  dailyDigestInstructions,
  dailyEditorialWriterInstructions,
  legacyDailyEditorialWriterInstructions,
} from "./openai-responses-reader-summary-daily-instructions";
export { buildOpenAiReaderSummaryPromptPayload } from "./openai-responses-reader-summary-prompt-payload";

import type { ReaderSummaryModelInput } from "../../ports";
import { buildLegacyReaderSummaryInstructions } from "./openai-responses-reader-summary-legacy-instructions";

export type ReaderSummaryPromptRelease = {
  readonly id: string;
  readonly releasedOn: string;
  readonly changeSummary: string;
};

/**
 * The current provider-neutral release of the prompt defined in this file.
 *
 * Keep only the current release here. Historical IDs already live in persisted
 * lineage, eval artifacts and Git, so a growing manual vN registry would only
 * duplicate history without explaining why a release exists.
 */
export const currentReaderSummaryPromptRelease = {
  id: "reader_summary.prompt.2026-08-30.immutable_editorial_slate",
  releasedOn: "2026-08-30",
  changeSummary:
    "Reader Promotion V2 Top 8 order is immutable and Additional 8 is secondary context only.",
} as const satisfies ReaderSummaryPromptRelease;

export const assertNoReaderSummaryPromptReleaseOverride = (params: {
  readonly environmentName: string;
  readonly value: string | undefined;
}): void => {
  if (params.value?.trim()) {
    throw new Error(
      `${params.environmentName} is no longer supported; the Reader Summary prompt release is owned by the compiled prompt contract`,
    );
  }
};

export const buildOpenAiReaderSummaryInstructions = (
  input: ReaderSummaryModelInput,
): string =>
  input.dailyEditorialPlan !== undefined ? (input.dailyEditorialPlan.version === "reader_summary.daily_editorial.v1" ? legacyDailyEditorialWriterInstructions(input) : dailyEditorialWriterInstructions(input)).join("\n") :
  input.evidence.dailyGenerationInput !== undefined ? dailyDigestInstructions(input) : buildLegacyReaderSummaryInstructions(input);

