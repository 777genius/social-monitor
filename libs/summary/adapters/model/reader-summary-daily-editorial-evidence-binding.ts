import type { ReaderSummaryDailyGenerationInput } from "../../domain";

export function buildDailyEditorialPromptFromEvidence(
  frozen: ReaderSummaryDailyGenerationInput,
  evidence: readonly Record<string, unknown>[],
): string {
  if (evidence.length !== frozen.selected.length) {
    throw new Error("Daily editorial evidence length differs from frozen input");
  }
  return JSON.stringify({
    version: "reader_summary.daily_editorial.request.v1",
    frozenInputSha256: frozen.manifestSha256,
    periodKey: frozen.periodKey,
    sourceWindowCutoff: frozen.cutoffAt,
    sources: evidence.map((item, index) => {
      const binding = frozen.selected[index]!;
      if (binding.feedItemId !== item.feedItemId) {
        throw new Error("Daily editorial evidence order differs from frozen input");
      }
      return { ...item, storyId: binding.storyId, publishedAt: binding.publishedAt,
        providerKey: binding.providerKey, nativeCount: binding.nativeCount,
        engagementObservedAt: binding.engagementObservedAt };
    }),
  });
}
