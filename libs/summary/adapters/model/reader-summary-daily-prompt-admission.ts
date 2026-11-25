import type { DailyEditorialPlan, ReaderSummaryDailyGenerationInput } from "../../domain";

/**
 * Validates the exact untrusted writer prompt against the frozen selection and
 * editorial plan before the receipt code hashes anything. This boundary reads
 * the client-bound prompt, never provider output or model-generated claims.
 */
export const admitFrozenReaderSummaryDailyPrompt = (
  prompt: string,
  proof: ReaderSummaryDailyGenerationInput,
  editorialPlan?: DailyEditorialPlan,
): {
  readonly evidence: readonly { readonly feedItemId?: unknown }[];
  readonly dailyEditorialPlan?: DailyEditorialPlan;
} => {
  const payload = JSON.parse(prompt) as { evidence?: readonly { feedItemId?: unknown }[];
    additionalEvidence?: readonly unknown[]; contextArtifacts?: readonly unknown[];
    dailyEditorialPlan?: DailyEditorialPlan };
  const evidence = payload.evidence;
  if (!Array.isArray(evidence) || evidence.length !== proof.selected.length ||
      evidence.some((entry, index) => entry.feedItemId !== proof.selected[index]?.feedItemId) ||
      (payload.additionalEvidence?.length ?? 0) !== 0 || (payload.contextArtifacts?.length ?? 0) !== 0) {
    throw new Error("Daily model input differs from frozen generation selection");
  }
  if ((editorialPlan === undefined) !== (payload.dailyEditorialPlan === undefined) ||
      (editorialPlan !== undefined &&
        JSON.stringify(payload.dailyEditorialPlan) !== JSON.stringify(editorialPlan))) {
    throw new Error("Daily writer prompt omitted the validated editorial plan");
  }
  return { evidence, dailyEditorialPlan: payload.dailyEditorialPlan };
};
