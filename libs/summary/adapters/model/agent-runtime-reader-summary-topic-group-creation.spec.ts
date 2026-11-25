import {
  READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
  type ReaderSummaryTopicNodeLabel,
} from "../../domain";
import { assignNewGroundedTopicGroups } from "./agent-runtime-reader-summary-topic-group-creation";

const ungrouped = READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID;

const label = (nodeId: string, groupId = ungrouped): ReaderSummaryTopicNodeLabel => ({
  nodeId,
  groupId,
  label: nodeId,
  keywords: [],
});

describe("assignNewGroundedTopicGroups", () => {
  it("assigns only the ranked window and preserves collision-safe IDs without input mutation", () => {
    const labels = [
      label("o1"),
      label("o2"),
      label("m1"),
      label("m2"),
      label("existing", "group:openai"),
    ];
    const anchors = new Map([
      ["o1", new Set(["openai"])],
      ["o2", new Set(["openai"])],
      ["m1", new Set(["mcp"])],
      ["m2", new Set(["mcp"])],
    ]);
    const existingAnchors = new Map<string, readonly string[]>([
      ["group:openai", ["OpenAI"]],
    ]);
    const activeIds = new Set(["group:openai"]);
    const alreadyRecovered = new Set(["existing"]);
    const result = assignNewGroundedTopicGroups({
      nodeLabels: labels,
      identityAnchorsByNodeId: anchors,
      recoveryCandidates: [
        { key: "openai", display: "OpenAI" },
        { key: "mcp", display: "MCP" },
      ],
      activeGroupIds: activeIds,
      semanticAnchorsByGroup: existingAnchors,
      recoveredNodeIds: alreadyRecovered,
      availableGroupSlots: 1,
    });
    expect(result.nodeLabels.map((item) => item.groupId)).toEqual([
      "group:openai-2",
      "group:openai-2",
      ungrouped,
      ungrouped,
      "group:openai",
    ]);
    expect([...result.recoveredNodeIds].sort()).toEqual(["existing", "o1", "o2"]);
    expect([...result.semanticAnchorsByGroup]).toEqual([
      ["group:openai", ["OpenAI"]],
      ["group:openai-2", ["OpenAI"]],
    ]);
    expect(labels.every((item) => item.groupId !== "group:openai-2")).toBe(true);
    expect([...existingAnchors]).toEqual([["group:openai", ["OpenAI"]]]);
    expect([...activeIds]).toEqual(["group:openai"]);
    expect([...alreadyRecovered]).toEqual(["existing"]);
  });

  it("does not shift the ranked candidate window if the first candidate is unsupported", () => {
    const result = assignNewGroundedTopicGroups({
      nodeLabels: [label("a"), label("b")],
      identityAnchorsByNodeId: new Map([
        ["a", new Set(["mcp"])],
        ["b", new Set(["mcp"])],
      ]),
      recoveryCandidates: [
        { key: "openai", display: "OpenAI" },
        { key: "mcp", display: "MCP" },
      ],
      activeGroupIds: new Set(),
      semanticAnchorsByGroup: new Map(),
      recoveredNodeIds: new Set(),
      availableGroupSlots: 1,
    });
    expect(result.nodeLabels.map((item) => item.groupId)).toEqual([
      ungrouped,
      ungrouped,
    ]);
    expect(result.recoveredNodeIds.size).toBe(0);
    expect(result.semanticAnchorsByGroup.size).toBe(0);
  });

  it("never reassigns already recovered or pre-grouped identities", () => {
    const result = assignNewGroundedTopicGroups({
      nodeLabels: [
        label("already"),
        label("free"),
        label("assigned", "group:anthropic"),
      ],
      identityAnchorsByNodeId: new Map([
        ["already", new Set(["openai"])],
        ["free", new Set(["openai"])],
        ["assigned", new Set(["openai"])],
      ]),
      recoveryCandidates: [{ key: "openai", display: "OpenAI" }],
      activeGroupIds: new Set(["group:anthropic"]),
      semanticAnchorsByGroup: new Map([["group:anthropic", ["Anthropic"]]]),
      recoveredNodeIds: new Set(["already"]),
      availableGroupSlots: 1,
    });
    expect(result.nodeLabels.map((item) => item.groupId)).toEqual([
      ungrouped,
      ungrouped,
      "group:anthropic",
    ]);
    expect([...result.recoveredNodeIds]).toEqual(["already"]);
    expect([...result.semanticAnchorsByGroup.keys()]).toEqual(["group:anthropic"]);
  });

  it("does not create a recovered cohort from duplicate views of one node", () => {
    const labels = [label("same"), label("same")];
    const result = assignNewGroundedTopicGroups({
      nodeLabels: labels,
      identityAnchorsByNodeId: new Map([["same", new Set(["orion"])]]),
      recoveryCandidates: [{ key: "orion", display: "Orion" }],
      activeGroupIds: new Set(),
      semanticAnchorsByGroup: new Map(),
      recoveredNodeIds: new Set(),
      availableGroupSlots: 1,
    });
    expect(result.nodeLabels.map((item) => item.groupId)).toEqual([ungrouped, ungrouped]);
    expect(result.recoveredNodeIds.size).toBe(0);
    expect(result.semanticAnchorsByGroup.size).toBe(0);
    expect(labels.every((item) => item.groupId === ungrouped)).toBe(true);
  });
});
