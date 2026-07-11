import {
  matchesReaderSummaryMultiDayGenerationProfile,
  readerSummaryMultiDayGenerationProfileMismatch,
} from "./reader-summary-multi-day-generation-profile";

const current = {
  modelVersion: "codex:gpt-5.5:xhigh",
  promptVersion: "reader_summary.prompt.agent_runtime.v9",
  rankingPolicyVersion: "story_ranking_v7",
};

describe("reader summary multi-day generation profile", () => {
  it("requires model, prompt, and ranking policy to match", () => {
    expect(
      matchesReaderSummaryMultiDayGenerationProfile(current, current),
    ).toBe(true);
    expect(
      matchesReaderSummaryMultiDayGenerationProfile(
        { ...current, rankingPolicyVersion: "story_ranking_v6" },
        current,
      ),
    ).toBe(false);
  });

  it("describes every provenance component on mismatch", () => {
    expect(readerSummaryMultiDayGenerationProfileMismatch(current)).toBe(
      "Generation profile mismatch: model=codex:gpt-5.5:xhigh prompt=reader_summary.prompt.agent_runtime.v9 ranking=story_ranking_v7",
    );
  });
});
