import {
  intersects,
  uniqueRecoveredGroupId,
} from "./agent-runtime-reader-summary-topic-anchor-keys";

describe("reader-summary topic anchor boundary", () => {
  it("requires explicit shared anchor evidence to intersect", () => {
    expect(intersects(new Set(["runtime"]), new Set(["runtime"]))).toBe(true);
    expect(intersects(new Set(["runtime"]), new Set(["editor"]))).toBe(false);
    expect(intersects(undefined, new Set(["runtime"]))).toBe(false);
  });

  it("creates deterministic conflict-free recovered group ids", () => {
    expect(uniqueRecoveredGroupId("Open Agents", new Set())).toBe("group:open-agents");
    expect(uniqueRecoveredGroupId("Open Agents", new Set(["group:open-agents"])))
      .toBe("group:open-agents-2");
    expect(uniqueRecoveredGroupId("Open Agents", new Set(["group:open-agents", "group:open-agents-2"])))
      .toBe("group:open-agents-3");
  });
});
