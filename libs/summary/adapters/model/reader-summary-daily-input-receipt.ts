import { createHash } from "node:crypto";
import type { ReaderSummaryDailyGenerationInput, ReaderSummaryDailyInputReceipt } from "../../domain";

/** Inspect only the command supplied to the real client, never model claims. */
export const readerSummaryDailyInputReceipt = (prompt: string,
  proof: ReaderSummaryDailyGenerationInput | undefined): ReaderSummaryDailyInputReceipt | undefined => {
  if (proof === undefined) return undefined;
  const payload = JSON.parse(prompt) as { evidence?: readonly { feedItemId?: unknown }[];
    additionalEvidence?: readonly unknown[]; contextArtifacts?: readonly unknown[] };
  const evidence = payload.evidence;
  if (!Array.isArray(evidence) || evidence.length !== proof.selected.length ||
      evidence.some((entry, index) => entry.feedItemId !== proof.selected[index]?.feedItemId) ||
      (payload.additionalEvidence?.length ?? 0) !== 0 || (payload.contextArtifacts?.length ?? 0) !== 0) {
    throw new Error("Daily model input differs from frozen generation selection");
  }
  return { payloadSha256: sha(prompt), evidence: evidence.map(entry => ({
    feedItemId: String(entry.feedItemId), sha256: sha(JSON.stringify(entry)) })) };
};

const sha = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");
