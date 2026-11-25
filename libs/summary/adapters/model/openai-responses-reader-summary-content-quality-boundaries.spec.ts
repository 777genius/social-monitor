import {
  normalizeQualityState as legacyQualityState,
  normalizeSourceMixEntry as legacySourceMixEntry,
  normalizeTrendDelta as legacyTrendDelta,
} from "./openai-responses-reader-summary-content-quality";
import { normalizeQualityState } from "./openai-responses-reader-summary-content-quality-state";
import {
  normalizeSourceMixEntry,
  normalizeTrendDelta,
} from "./openai-responses-reader-summary-content-provenance";

describe("Reader content provenance and quality admission boundaries", () => {
  it("preserves the original function identities for direct import consumers", () => {
    expect(legacyQualityState).toBe(normalizeQualityState);
    expect(legacySourceMixEntry).toBe(normalizeSourceMixEntry);
    expect(legacyTrendDelta).toBe(normalizeTrendDelta);
  });

  it("requires finite source counters while retaining optional counter fallback", () => {
    expect(normalizeSourceMixEntry({
      providerKey: " synthetic-rss ", itemCount: 2, citationCount: 1,
      storyClusterCount: -1, crossSourceClusterCount: "invalid",
      singleSourceOnly: false,
    })).toMatchObject({
      providerKey: "synthetic-rss", itemCount: 2, citationCount: 1,
      storyClusterCount: 0, crossSourceClusterCount: 0,
      singleSourceOnly: false, interestIds: [],
    });
    expect(() => normalizeSourceMixEntry({
      providerKey: "synthetic", itemCount: "2", citationCount: 1,
    })).toThrow("source mix item count must be a finite number");
  });

  it("does not manufacture missing trend windows or soften required arrays", () => {
    expect(normalizeTrendDelta({
      newSignals: [], growingSignals: [], repeatedSignals: [], fadingSignals: [],
    })).toEqual({
      newSignals: [], growingSignals: [], repeatedSignals: [], fadingSignals: [],
    });
    expect(() => normalizeTrendDelta({ newSignals: [], growingSignals: [] }))
      .toThrow("trend delta repeated signals must be an array");
  });

  it("preserves explicit cross-provider quality overrides and warning order", () => {
    expect(normalizeQualityState({
      isSingleSource: false, status: "ready",
      flags: ["context_unavailable"], warnings: ["synthetic warning"],
    }, [])).toEqual({
      status: "ready", flags: ["context_unavailable"],
      warnings: ["synthetic warning"], isSingleSource: false,
    });
    expect(normalizeQualityState({ status: "ready" }, [])).toMatchObject({
      status: "limited_sources", flags: ["limited_sources"],
      isSingleSource: true,
    });
    expect(() => normalizeQualityState({ status: "unsupported" }, []))
      .toThrow("Unsupported reader quality status");
  });
});
