import { createHash } from "node:crypto";
import type { ReaderSummaryModelEstimate } from "../../ports";
import type { DailyEditorialPlan } from "../../domain";

// Stable historical imports; policy and evidence admission have distinct owners.
export { dailyEditorialPurpose, dailyEditorialOutputSchema, dailyEditorialInstructions } from "./reader-summary-daily-editorial-policy";
export { buildDailyEditorialPrompt } from "./reader-summary-daily-editorial-prompt";
export { buildDailyEditorialPromptFromEvidence } from "./reader-summary-daily-editorial-evidence-binding";

export type DailyEditorialModelResult = {
  readonly plan: DailyEditorialPlan;
  readonly usage: ReaderSummaryModelEstimate;
  readonly editorRequestSha256: string;
  readonly editorOutputSha256: string;
};

export const dailyEditorialSha256 = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");
