import { createHash } from "node:crypto";
import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import type { ReaderSummaryDailyGenerationInput, ReaderSummaryDailyInputReceipt, DailyEditorialPlan } from "../../domain";
import { admitFrozenReaderSummaryDailyPrompt } from "./reader-summary-daily-prompt-admission";

/** Inspect only the command supplied to the real client, never model claims. */
export const readerSummaryDailyInputReceipt = (prompt: string,
  proof: ReaderSummaryDailyGenerationInput | undefined,
  editorialPlan?: DailyEditorialPlan): ReaderSummaryDailyInputReceipt | undefined => {
  if (proof === undefined) return undefined;
  const payload = admitFrozenReaderSummaryDailyPrompt(prompt, proof, editorialPlan);
  const evidence = payload.evidence;
  return { payloadSha256: sha(prompt), evidence: evidence.map(entry => ({
    feedItemId: String(entry.feedItemId), sha256: sha(JSON.stringify(entry)) })),
    ...(editorialPlan === undefined ? {} : {
      editorialPlanSha256: canonicalJsonSha256(payload.dailyEditorialPlan),
    }) };
};

const sha = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");
