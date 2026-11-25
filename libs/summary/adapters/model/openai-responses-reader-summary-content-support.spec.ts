import type { ReaderSummaryCitation } from "../../domain";
import { normalizeOpenAiReaderBrief } from "./openai-responses-reader-summary-content-support";

describe("normalizeOpenAiReaderBrief", () => {
  it("downgrades source-local ready quality to limited sources", () => {
    const content = normalizeOpenAiReaderBrief(
      {
        headline: "Social signal",
        oneLineTakeaway: "A Reddit signal needs confirmation.",
        bullets: ["A Reddit signal needs confirmation."],
        qualityState: {
          status: "ready",
          flags: [],
          warnings: [],
          isSingleSource: true,
        },
        interestSections: [],
        sourceMix: [
          {
            providerKey: "reddit",
            itemCount: 1,
            citationCount: 1,
            storyClusterCount: 1,
            crossSourceClusterCount: 0,
            singleSourceOnly: true,
            interestIds: ["ai"],
          },
        ],
        topReads: [
          {
            title: "Reddit AI discussion",
            providerKey: "reddit",
            reason: "Reddit users discuss an AI rollout.",
            canonicalUrl: "https://reddit.example/r/ai/comments/1",
            citationIds: ["c1"],
          },
        ],
        trendDelta: {
          newSignals: ["1 Reddit item selected"],
          growingSignals: [],
          repeatedSignals: [],
          fadingSignals: [],
        },
        openQuestions: [],
        risks: [],
        nextActions: [
          {
            kind: "read_source",
            label: "Read Reddit AI discussion",
            reason: "Open the Reddit discussion that needs confirmation.",
            citationIds: ["c1"],
            canonicalUrl: "https://reddit.example/r/ai/comments/1",
          },
        ],
      },
      [citation()],
    );

    expect(content.qualityState).toEqual({
      status: "limited_sources",
      flags: ["limited_sources"],
      warnings: [
        "Source coverage needs confirmation from another monitored provider.",
      ],
      isSingleSource: true,
    });
  });
});

const citation = (): ReaderSummaryCitation => ({
  citationId: "c1",
  feedItemId: "feed-reddit",
  sourceItemId: "source-reddit",
  providerKey: "reddit",
  field: "title",
  canonicalUrl: "https://reddit.example/r/ai/comments/1",
});
