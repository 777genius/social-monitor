import { READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID } from "../../domain";
import { buildTopicNormalizationWarnings } from "./agent-runtime-reader-summary-topic-normalization-warnings";
import { normalizeAgentRuntimeReaderSummaryTopicLabelPlan } from "./agent-runtime-reader-summary-topic-label-plan-normalizer";
import { topicIntegrityFixture } from "./agent-runtime-reader-summary-topic-integrity.spec-support";

describe("topic group projection and normalization diagnostics", () => {
  it("keeps input warnings ordered and reports low-confidence, rejected and recovered assignments separately", () => {
    const warnings = buildTopicNormalizationWarnings({
      raw: { warnings: [" source warning ", "", 17] },
      parsedNodeLabels: [
        { nodeId: "a", rawGroupId: "group:beacon", semantic: { confidenceScore: 0.3 } },
        { nodeId: "b", rawGroupId: "group:beacon", semantic: { confidenceScore: 0.95 } },
      ],
      nodeLabels: [
        { nodeId: "a", groupId: READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID },
        { nodeId: "b", groupId: "group:beacon" },
      ],
      groups: [{ id: "group:beacon", semanticAnchors: ["Beacon", "AI"] }],
      finalGroupIds: new Set(["group:beacon"]),
      groupRecords: new Map([["group:beacon", { semanticAnchors: ["Beacon"] }]]),
      recovery: { recoveredNodeCount: 2 },
    });
    expect(warnings).toEqual([
      "source warning",
      "1 low-confidence topic assignments were kept ungrouped",
      "1 topic assignments exceeded the semantic group contract and were marked ungrouped",
      "1 semantic group anchor sets were recovered from shared node evidence",
      "2 ungrouped topic assignments were recovered from shared grounded anchors",
    ]);
  });

  it("reports missing group definitions without inventing recovered singleton anchors", () => {
    const warnings = buildTopicNormalizationWarnings({
      raw: { warnings: null },
      parsedNodeLabels: [{ nodeId: "a", rawGroupId: READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID, semantic: { confidenceScore: 0.9 } }],
      nodeLabels: [{ nodeId: "a", groupId: READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID }],
      groups: [{ id: "group:beacon", semanticAnchors: ["Beacon"] }],
      finalGroupIds: new Set(["group:beacon"]),
      groupRecords: new Map(),
      recovery: { recoveredNodeCount: 0 },
    });
    expect(warnings).toEqual([
      "1 semantic group definitions were recovered from canonical node assignments",
    ]);
  });

  it("keeps first group definition, trusted metadata and stable group membership", () => {
    const fixture = topicIntegrityFixture(["Beacon", "Beacon"], ["Beacon", "Beacon"], [["Beacon"], ["Beacon"]]);
    fixture.rawLabels.forEach((label) => { label.groupId = "group:beacon"; });
    const plan = normalizeAgentRuntimeReaderSummaryTopicLabelPlan({
      nodeLabels: fixture.rawLabels,
      groups: [
        { id: "group:beacon", label: "Beacon", semanticAnchors: ["Beacon"], confidenceScore: 0.8, rationale: "Matching evidence" },
        { id: "group:beacon", label: "Ignored duplicate", semanticAnchors: ["untrusted"], confidenceScore: 0.1 },
      ],
    }, fixture.candidates);
    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0]).toMatchObject({
      id: "group:beacon",
      label: "Beacon",
      nodeIds: fixture.candidates.map((candidate) => candidate.nodeId),
      confidenceScore: 0.8,
      rationale: "Matching evidence",
    });
    expect(plan.groups[0]?.semanticAnchors).toContain("Beacon");
    expect(plan.nodeLabels.every((node) => node.groupId === "group:beacon")).toBe(true);
  });
});
