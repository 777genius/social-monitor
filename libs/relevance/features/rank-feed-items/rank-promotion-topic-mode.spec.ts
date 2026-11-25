import { evaluateReaderPromotionV2 } from "@social-monitor/feed/domain";
import type { JsonObject, JsonValue } from "@social-monitor/shared-kernel";
import { normalizeSourceContentQualityInput } from "../../domain/source-content-quality-normalizer";
import {
  context, feedItem, metadataWith, nativeMetadata, rankItems, v2Candidate,
} from "./rank-promotion-topic-context.spec-support";

const breadTitle = "Local bakers share their best bread recipes with neighbors";
const metadataFor = (sourceQuery: JsonObject, interestQuery = "Mistral financing") => metadataWith({
  interestQuerySnapshot: { ...context.interestQuerySnapshot, query: interestQuery },
  sourceBindingSnapshot: { ...context.sourceBindingSnapshot, sourceQuery },
});

const cases = [
  ["listing", "best", breadTitle],
  ["listing", "show", "Local bakers show their bread recipes to neighbors every weekend"],
  ["listing", "job", "Local bakers describe each job involved in baking bread for neighbors"],
  ["listing", "top", "Local bakers list top bread recipes enjoyed by neighbors every weekend"],
  ["listing", "BreadBaking", "BreadBaking neighbors exchange recipes and compare loaves at their annual festival"],
  ["account_feed", "bakers", breadTitle],
  ["thread", "recipes", breadTitle],
  ["url", "https://example.test/ai", "AI painters display colorful pictures at the neighborhood gallery this weekend"],
] as const;

describe("actual promotion caller source query modes", () => {
  it.each(cases)("does not qualify from %s acquisition %s", async (mode, query, title) => {
    // For URL/AI, a developer interest corroborates HN community context but
    // does not match the story. Ungated URL tokenization would activate AI.
    const interest = mode === "url" ? "developer" : "Mistral financing";
    const [item] = await rankItems([feedItem({ title,
      providerMetadata: metadataFor({ mode, query }, interest),
    })], { query: interest });
    expect(item!.contentQuality).toMatchObject({ interestRelevanceScore: 0.38,
      decision: "downrank", eligibleForTopRead: false,
      flags: expect.arrayContaining(["weak_topic_match"]),
    });
    expect(evaluateReaderPromotionV2(v2Candidate(item!))).toMatchObject({
      admitted: false, reasons: expect.arrayContaining(["relevance_floor_not_met"]),
    });
    expect(item!.providerMetadata).toEqual({ ...nativeMetadata,
      query: interest,
    });
    expect(normalizeSourceContentQualityInput({ providerKey: item!.providerKey,
      title, providerMetadata: item!.providerMetadata,
    }).topicTerms).not.toContain(mode === "url" ? "ai" : query.toLowerCase());
  });

  it.each<JsonValue | undefined>(["unknown", undefined, null, "", 5])(
    "keeps unrelated independent intent despite missing/invalid acquisition mode %j", async (mode) => {
      const sourceQuery = { query: "best", ...(mode === undefined ? {} : { mode }) };
      const [item] = await rankItems([feedItem({ title: breadTitle,
        providerMetadata: metadataFor(sourceQuery),
      })]);
      expect(item!.providerMetadata).toEqual({ ...nativeMetadata, query: "Mistral financing" });
      expect(item!.contentQuality.flags).toContain("weak_topic_match");
      expect(evaluateReaderPromotionV2(v2Candidate(item!)).admitted).toBe(false);
    },
  );

  it.each([
    ["best", breadTitle],
    ["Go", "Go compiler engineers publish detailed performance measurements for their latest implementation"],
    ["ai", "AI painters display colorful pictures at the neighborhood gallery this weekend"],
  ])("keeps explicit search %s positive through the caller", async (query, title) => {
    const [item] = await rankItems([feedItem({ title,
      providerMetadata: metadataFor({ mode: "search", query }, "developer"),
    })], { query });
    expect(item!.contentQuality.interestRelevanceScore).toBe(0.9);
    expect(evaluateReaderPromotionV2(v2Candidate(item!))).toMatchObject({ admitted: true, topQualified: true });
  });

  it.each(["listing", "account_feed", "thread", "url"])(
    "keeps independently configured interest positive with %s acquisition", async (mode) => {
      // The configured query is injected independently of copied metadata.
      const [item] = await rankItems([feedItem({ title: breadTitle,
        providerMetadata: metadataFor({ mode, query: "unrelated" }, "bread recipes"),
      })], { query: "bread recipes" });
      expect(item!.contentQuality.interestRelevanceScore).toBe(0.9);
      expect(evaluateReaderPromotionV2(v2Candidate(item!))).toMatchObject({ admitted: true, topQualified: true });
    },
  );

  it.each(["best", "bread recipes"])("uses independent %s intent despite identical copied listing metadata", async (query) => {
    const copied = feedItem({ title: breadTitle,
      providerMetadata: metadataFor({ mode: "listing", query: "best" }, "best") });
    const [negative] = await rankItems([copied], { query: "Mistral financing" });
    const [positive] = await rankItems([copied], { query });
    expect(evaluateReaderPromotionV2(v2Candidate(negative!)).admitted).toBe(false);
    expect(evaluateReaderPromotionV2(v2Candidate(positive!))).toMatchObject({ admitted: true, topQualified: true });
  });
});
