import { isReaderPromotionStoryTitleDuplicate } from "./reader-promotion-story-title-duplicate";

describe("isReaderPromotionStoryTitleDuplicate", () => {
  it("collapses a Reddit follow-up that only appends detail to the same headline", () => {
    expect(isReaderPromotionStoryTitleDuplicate(
      "Kimi routed to Claude",
      "Kimi routed to Claude, leaked chinese data",
    )).toBe(true);
  });

  it("collapses generated X handle prefixes of the same story", () => {
    expect(isReaderPromotionStoryTitleDuplicate(
      "X post by @lab: Anthropic revealed that Claude was misused",
      "Anthropic revealed that Claude was misused for weapons development",
    )).toBe(true);
  });

  it("does not merge different Claude Code version notes", () => {
    expect(isReaderPromotionStoryTitleDuplicate(
      "Claude Code 2.1.267 adds provider-wide effort caps",
      "Claude Code 2.1.270 has been released",
    )).toBe(false);
  });

  it("does not merge short shared product names", () => {
    expect(isReaderPromotionStoryTitleDuplicate(
      "Claude Code",
      "Claude Code plugin evaluation with comparative test runs",
    )).toBe(false);
  });
});
