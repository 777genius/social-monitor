import { READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID } from "../../domain";
import { supportedAnchors, sharedUngroupedAnchors } from "./agent-runtime-reader-summary-topic-anchor-support";

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

  it("never treats repeated node ids as independent anchor confirmations", () => {
    const anchors = new Map<string, ReadonlySet<string>>([
      ["a", new Set(["orion"])],
      ["b", new Set(["orion"])],
    ]);
    expect([...supportedAnchors(["a", "a"], anchors, ["orion"])]).toEqual([]);
    expect([...supportedAnchors(["a", "a", "b"], anchors, ["orion"])]).toEqual(["orion"]);
  });

  it("deduplicates ungrouped identities before ranking independent candidate support", () => {
    const labels = ["a", "a", "b"].map((nodeId) => ({
      nodeId, label: "Orion", groupId: READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
      keywords: ["Orion"],
    }));
    const anchors = new Map<string, ReadonlySet<string>>([
      ["a", new Set(["orion"])], ["b", new Set(["orion"])],
    ]);
    const candidate = (nodeId: string, score: number) => ({
      nodeId, storyClusterId: `story:${nodeId}`, fallbackLabel: "Orion research",
      score, evidenceCount: 1, providerKeys: ["rss"], interestIds: ["ai"],
      keywords: ["Orion"], labelCandidates: [],
    });
    const candidates = new Map([
      ["a", candidate("a", 2)], ["b", candidate("b", 5)],
    ]);
    expect(sharedUngroupedAnchors(labels, anchors, candidates)).toEqual([
      { key: "orion", display: "Orion", score: 2007 },
    ]);
    expect(sharedUngroupedAnchors(labels.slice(0, 2), anchors, candidates)).toEqual([]);
  });
});
