import { StaticSourceTargetCatalogAdapter } from "../adapters/target-catalog/static-source-target-catalog.adapter";
import { aiDeveloperSignalSourcePreset } from "./source-target-presets";

describe("aiDeveloperSignalSourcePreset", () => {
  it("contains valid source targets for the subscription catalog", () => {
    const catalog = new StaticSourceTargetCatalogAdapter();

    expect(aiDeveloperSignalSourcePreset.entries).toHaveLength(21);
    for (const entry of aiDeveloperSignalSourcePreset.entries) {
      expect(
        catalog.validateTarget({
          providerKey: entry.providerKey,
          targetKind: entry.targetKind,
          targetValue: entry.targetValue,
          config: entry.targetConfig,
        }),
      ).toMatchObject({ ok: true });
    }
  });

  it("uses Reddit daily multi-pass source config for AI discussion discovery", () => {
    const redditEntry = aiDeveloperSignalSourcePreset.entries.find(
      (entry) => entry.providerKey === "reddit",
    );

    expect(redditEntry).toMatchObject({
      targetKind: "search_query",
      targetValue: "OpenAI LocalLLaMA MachineLearning AI agents",
      targetConfig: {
        maxItems: 30,
        scanPasses: [
          {
            mode: "listing",
            subreddit: "OpenAI",
            listing: "top",
            topTime: "day",
          },
          {
            mode: "listing",
            subreddit: "LocalLLaMA",
            listing: "top",
            topTime: "day",
          },
          {
            mode: "listing",
            subreddit: "MachineLearning",
            listing: "top",
            topTime: "day",
          },
          {
            mode: "search",
            query:
              'OpenAI OR LocalLLaMA OR "machine learning" OR "AI agents" OR LLM',
          },
        ],
      },
    });
  });
});
