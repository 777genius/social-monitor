import type { ReaderSummaryTopicNodeLabel } from "../../domain";
import type { ReaderSummaryTopicLabelerInput } from "../../ports";
import {
  buildGroundedTopicRecoveryAnchorMaps,
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
  it("binds evidence to matching node IDs without letting candidate text rewrite identity anchors", () => {
    const nodeLabels: readonly ReaderSummaryTopicNodeLabel[] = [
      { nodeId: "topic:codex", label: "Codex", keywords: [] },
      { nodeId: "topic:claude", label: "Claude", keywords: [] },
    ];
    const candidates: ReaderSummaryTopicLabelerInput["candidates"] = [
      {
        nodeId: "topic:claude", storyClusterId: "story:claude",
        fallbackLabel: "Anthropic Claude", score: 9, evidenceCount: 1,
        providerKeys: ["rss"], interestIds: ["ai"], keywords: [], labelCandidates: [],
      },
      {
        nodeId: "topic:codex", storyClusterId: "story:codex",
        fallbackLabel: "OpenAI Codex", score: 10, evidenceCount: 1,
        providerKeys: ["rss"], interestIds: ["ai"], keywords: [], labelCandidates: [],
      },
    ];
    const result = buildGroundedTopicRecoveryAnchorMaps({ nodeLabels, candidates });
    expect([...result.candidateByNodeId.keys()]).toEqual(["topic:claude", "topic:codex"]);
    expect(result.anchorsByNodeId.get("topic:codex")?.has("openai")).toBe(true);
    expect(result.anchorsByNodeId.get("topic:claude")?.has("anthropic")).toBe(true);
    expect(result.anchorsByNodeId.get("topic:codex")?.has("anthropic")).toBe(false);
    expect(result.identityAnchorsByNodeId.get("topic:codex")?.has("openai")).toBe(false);
    expect(result.identityAnchorsByNodeId.get("topic:codex")?.has("codex")).toBe(true);
  });

  it("keeps a node's own anchors when no matching evidence candidate exists", () => {
    const result = buildGroundedTopicRecoveryAnchorMaps({
      nodeLabels: [{ nodeId: "topic:claude", label: "Claude", keywords: [] }],
      candidates: [],
    });
    expect(result.candidateByNodeId.size).toBe(0);
    expect(result.anchorsByNodeId.get("topic:claude")?.has("claude")).toBe(true);
    expect(result.identityAnchorsByNodeId.get("topic:claude")?.has("claude")).toBe(true);
  });

});
