import type {
  ReaderSummaryWeeklyStoryAuthorityBinding,
} from "../value-objects/reader-summary-weekly-story-authority";
import {
  deriveReaderSummaryWeeklyStoryIdentity,
} from "../value-objects/reader-summary-weekly-story-identity";
import {
  observeReaderSummaryWeeklyStory,
  readerSummaryWeeklyStoryDateKey,
} from "./reader-summary-weekly-story-observation";

describe("reader summary weekly story observation boundary", () => {
  it("uses one stable semantic story identity across dates and weeks", () => {
    const identity = storyIdentity();
    const replay = storyIdentity();

    expect(replay.identity).toBe(identity.identity);
    expect(
      readerSummaryWeeklyStoryDateKey(identity, "2026-07-05"),
    ).toBe(readerSummaryWeeklyStoryDateKey(replay, "2026-07-05"));
    expect(
      readerSummaryWeeklyStoryDateKey(identity, "2026-07-12"),
    ).not.toBe(readerSummaryWeeklyStoryDateKey(identity, "2026-07-05"));
  });

  it("separates different reviewed stories on the same date", () => {
    const first = storyIdentity();
    const second = deriveReaderSummaryWeeklyStoryIdentity({
      subjectKey: "product:openai/codex",
      actionKey: "action:release",
      objectKeys: ["capability:review"],
      qualifierKeys: ["audience:developer"],
    });

    expect(
      readerSummaryWeeklyStoryDateKey(first, "2026-07-05"),
    ).not.toBe(readerSummaryWeeklyStoryDateKey(second, "2026-07-05"));
  });

  it("never invokes inherited authority binding readers", () => {
    const callerReader = jest.fn(() => ({ trusted: true }));
    const inheritedReader = Object.freeze(
      Object.create({ readBinding: callerReader }) as object,
    ) as ReaderSummaryWeeklyStoryAuthorityBinding;

    expect(() =>
      observeReaderSummaryWeeklyStory(
        {
          storyIdentity: storyIdentity(),
          authority: inheritedReader,
          evidence: [],
        },
        [],
      ),
    ).toThrow("must be a plain object");
    expect(callerReader).not.toHaveBeenCalled();
  });

  it.each([
    "firstSeen",
    "lastSeen",
    "resolved",
    "resolvedAt",
    "transition",
    "previousObservationId",
  ] as const)("rejects caller-invented %s chronology", (field) => {
    expect(() =>
      observeReaderSummaryWeeklyStory(
        {
          storyIdentity: storyIdentity(),
          authority: Object.freeze(
            {},
          ) as ReaderSummaryWeeklyStoryAuthorityBinding,
          evidence: [],
          [field]: "caller-authored",
        } as never,
        [],
      ),
    ).toThrow("must contain exactly");
  });
});

const storyIdentity = () =>
  deriveReaderSummaryWeeklyStoryIdentity({
    subjectKey: "product:openai/codex",
    actionKey: "action:release",
    objectKeys: ["capability:agent"],
    qualifierKeys: ["audience:developer"],
  });
