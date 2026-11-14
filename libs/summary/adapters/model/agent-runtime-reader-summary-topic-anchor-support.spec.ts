import { supportedAnchors } from "./agent-runtime-reader-summary-topic-anchor-support";

describe("grounded topic anchor support", () => {
  it("requires evidence from at least two nodes even for explicit provider anchors", () => {
    const anchors = new Map<string, ReadonlySet<string>>([
      ["a", new Set(["orion", "ai", "solo"])],
      ["b", new Set(["orion", "ai"])],
      ["c", new Set(["lyra"])],
    ]);

    expect([...supportedAnchors(["a", "b", "c"], anchors, ["solo", "lyra", "unseen"])]).toEqual(["orion"]);
  });

  it("counts each grounded node once per anchor and preserves stable support order", () => {
    const anchors = new Map<string, ReadonlySet<string>>([
      ["a", new Set(["lyra", "orion"])],
      ["b", new Set(["lyra", "orion"])],
      ["c", new Set(["vega"])],
    ]);

    expect([...supportedAnchors(["a", "b", "c"], anchors, [])]).toEqual(["lyra", "orion"]);
    expect([...supportedAnchors(["a", "c"], anchors, ["orion"])]).toEqual([]);
  });
});
