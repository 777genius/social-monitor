import type { JsonObject, JsonValue } from "@social-monitor/shared-kernel";
import { normalizeSourceContentQualityInput } from "./source-content-quality-normalizer";

const normalize = (providerMetadata: JsonObject) => normalizeSourceContentQualityInput({
  providerKey: "hacker-news",
  title: "Local bakers share their best bread recipes with neighbors",
  canonicalUrl: "https://example.test/bread",
  providerMetadata,
});

describe("source query mode topic extraction", () => {
  it.each<JsonValue | undefined>([
    "listing", "account_feed", "thread", "url", "unknown", undefined,
    null, "", 5, [], {}, "SEARCH", " search ",
  ])("excludes keywords, short topics and literal terms for mode %j", (mode) => {
    const sourceQuery = { query: "best ai Go job", ...(mode === undefined ? {} : { mode }) };
    const metadata = { sourceBindingSnapshot: { sourceQuery } };
    expect(normalize(metadata)).toMatchObject({ topicTerms: [], missingTopicContext: true });
    expect(metadata.sourceBindingSnapshot.sourceQuery).toEqual(sourceQuery);
  });

  it("excludes the short AI token embedded in an acquisition URL", () => {
    expect(normalize({ sourceBindingSnapshot: {
      sourceQuery: { mode: "url", query: "https://example.test/ai" },
    } }).topicTerms).toEqual([]);
  });

  it("keeps both keyword and literal branches for explicit search", () => {
    expect(normalize({ sourceBindingSnapshot: {
      sourceQuery: { mode: "search", query: "best ai Go job" },
    } }).topicTerms).toEqual(expect.arrayContaining(["best", "ai", "go", "job"]));
  });

  it.each(["searchQuery", "query"])("preserves the existing top-level %s contract", (key) => {
    expect(normalize({ [key]: "Go" }).topicTerms).toEqual(["go"]);
  });

  it("preserves interest terms independently of the acquisition mode", () => {
    expect(normalize({
      interestQuerySnapshot: { query: "Mistral financing" },
      sourceBindingSnapshot: { sourceQuery: { mode: "listing", query: "best" } },
    })).toMatchObject({ topicTerms: ["financing", "mistral"], weakTopicMatch: true });
  });
});
