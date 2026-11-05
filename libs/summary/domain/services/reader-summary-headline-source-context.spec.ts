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
  it("does not preserve punctuation-only text as a copied headline", () => {
    expect(groundedReaderHeadline({
      headline: "!!!",
      sourceTitles: ["!!!", "", "   "],
      sourceMix: [],
      topReads: [lead("Source heading\n\nFull source context.")],
    })).toBe("Discussion from monitored sources");
  });

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

  it.each([
    { title: "Discussion of runtime isolation", confidence: "low", providers: ["reddit"] },
    { title: "Runtime isolation improves", confidence: "high", providers: ["reddit"] },
    { title: "Runtime isolation improves", confidence: "low", providers: ["reddit", "rss"] },
  ] as const)("never generates a bare source heading: $title / $confidence / $providers", ({
    title, confidence, providers,
  }) => {
    expect(groundedReaderHeadline({
      headline: "Summary: current discussion",
      sourceTitles: [title],
      sourceMix: [],
      topReads: [{
        ...lead(title),
        confidence: { level: confidence, score: 0.9, rationale: "Synthetic support" },
        confirmedProviderKeys: [...providers],
      }],
    })).toBe(`Reports discuss ${title}`);
  });

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
