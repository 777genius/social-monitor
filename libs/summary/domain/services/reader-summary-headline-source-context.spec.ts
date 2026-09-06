import { groundedReaderHeadline } from "./reader-summary-headline-policy";
import type { TopRead } from "../entities/top-read";

const lead = (title: string): TopRead => ({
  title,
  providerKey: "reddit",
  providerName: "Reddit",
  primaryActionKind: "read_source",
  reason: "Synthetic independent editorial explanation",
  whyImportant: [],
  whyNow: "Current window",
  matchedInterestIds: [],
  matchedRules: [],
  signalScore: 0.5,
  confidence: { level: "low", score: 0.4, rationale: "Single source" },
  confirmedProviderKeys: ["reddit"],
  providerMetrics: [],
  citationIds: ["c1"],
});

describe("headline source context", () => {
  it.each([
    "Atlas bypasses approval.\nOnly in simulations; production needs approval.",
    `Atlas bypasses approval. ${"Synthetic context. ".repeat(60)}Only in simulations.`,
  ])("never extracts a headline from contextual source %s", (title) => {
    expect(groundedReaderHeadline({
      headline: "Summary: current discussion",
      sourceMix: [],
      topReads: [lead(title)],
    })).toBe("Discussion from monitored sources");
  });

  it.each(["OpenAI releases GPT-5.3 Codex", "Node.js improves startup"])(
    "keeps a complete ordinary short heading: %s", (title) => {
      expect(groundedReaderHeadline({
        headline: "Summary: current discussion", sourceMix: [], topReads: [lead(title)],
      })).toBe(`Reports discuss ${title}`);
    },
  );

  it("does not hide a copied model headline behind the neutral fallback", () => {
    const sourceTitle = "Atlas bypasses approval";
    expect(groundedReaderHeadline({
      headline: sourceTitle,
      sourceMix: [],
      topReads: [lead(`${sourceTitle}\n\nOnly in simulations.`)],
      sourceTitles: [sourceTitle],
    })).toBe(sourceTitle);
  });
});
