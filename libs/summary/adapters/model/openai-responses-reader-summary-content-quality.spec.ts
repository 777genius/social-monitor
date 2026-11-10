import {
  normalizeQualityState,
  normalizeSourceMixEntry,
  normalizeTrendDelta,
} from "./openai-responses-reader-summary-content-quality";

describe("Reader brief quality and source-mix policy", () => {
  it("downgrades single-source ready status and adds a stable warning once", () => {
    const mix = normalizeSourceMixEntry({
      providerKey: "reddit", itemCount: 1, citationCount: 1,
      singleSourceOnly: true,
    });
    const state = normalizeQualityState({
      status: "ready",
      flags: ["limited_sources", "limited_sources"],
      warnings: [],
    }, [mix]);
    expect(state).toEqual({
      status: "limited_sources",
      flags: ["limited_sources"],
      warnings: ["Source coverage needs confirmation from another monitored provider."],
      isSingleSource: true,
    });
  });

  it("does not manufacture limited source warnings for cross-provider content", () => {
    const mix = normalizeSourceMixEntry({
      providerKey: "reddit", itemCount: 2, citationCount: 1,
      singleSourceOnly: false,
    });
    expect(normalizeQualityState({ status: "ready" }, [mix, mix])).toMatchObject({
      status: "ready", flags: [], warnings: [], isSingleSource: false,
    });
  });

  it("requires all trend windows and numeric source mix counters", () => {
    expect(normalizeTrendDelta({
      newSignals: ["synthetic"], growingSignals: [], repeatedSignals: [], fadingSignals: [],
    }).newSignals).toEqual(["synthetic"]);
    expect(() => normalizeTrendDelta({ newSignals: [] })).toThrow();
    expect(() => normalizeSourceMixEntry({ providerKey: "reddit", itemCount: "invalid", citationCount: 1 }))
      .toThrow();
  });
});
