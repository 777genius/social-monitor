import { evaluateReaderSummaryTopicMapStructure } from "../../domain/policies/reader-summary-topic-map-structure-quality";
import {
  READER_SUMMARY_TOPIC_MAP_MAX_NODES,
  READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS,
} from "../../domain/policies/reader-summary-topic-map-grouping-policy";
import { groundReaderSummaryTopicNodeLabel } from "../../domain/services/reader-summary-topic-label-candidates";
import { sanitizeTopicNodeLabel } from "../../domain/services/reader-summary-topic-node-label-sanitizer";
import { buildGroundedTopicCohortsForCandidates } from "./agent-runtime-reader-summary-topic-grounded-cohorts";
import { selectAgentRuntimeReaderSummaryTopicCandidates } from "./agent-runtime-reader-summary-topic-candidate-selection";
import { normalizeAgentRuntimeReaderSummaryTopicLabelPlan } from "./agent-runtime-reader-summary-topic-label-plan-normalizer";
import {
  buildDistinctIntegrityMap,
  normalizeIntegrityFixture,
  topicIntegrityFixture,
  ungrouped,
} from "./agent-runtime-reader-summary-topic-integrity.spec-support";

const subjects = ["Beacon", "Harbor", "Quartz", "Nimbus", "Redwood", "Cobalt", "Juniper", "Saffron"];
const fullKeywords = ["Copper", "Silver", "Zinc", "Tin", "Nickel", "Cobalt", "Iron", "Oak"];
const partialCohort = () => {
  const fixture = topicIntegrityFixture(
    subjects,
    subjects.map((subject, index) => index < 4 ? `Orion ${subject}` : subject),
    subjects.map(() => fullKeywords),
  );
  fixture.rawLabels.slice(0, 3).forEach((label) => { label.groupId = "group:orion"; });
  return fixture;
};

describe("topic cohort integrity across normalization, reconciliation and builder", () => {
  it("completes 3 correct plus 1 missing of 8 without losing full-cap anchors or identity", () => {
    const fixture = partialCohort();
    const selected = selectAgentRuntimeReaderSummaryTopicCandidates({
      candidates: fixture.candidates, clusters: fixture.params.clusters,
    }, READER_SUMMARY_TOPIC_MAP_MAX_NODES);
    expect(selected).toHaveLength(8);
    expect(buildGroundedTopicCohortsForCandidates(selected)).toEqual([
      expect.objectContaining({ nodeIds: fixture.candidates.slice(0, 4).map((item) => item.nodeId) }),
    ]);
    const plan = normalizeAgentRuntimeReaderSummaryTopicLabelPlan({
      nodeLabels: fixture.rawLabels, groups: [],
    }, selected);
    expect(plan.nodeLabels.map((label) => label.topicId)).toEqual(fixture.rawLabels.map((label) => label.topicId));
    expect(plan.groups[0]?.nodeIds).toEqual(fixture.candidates.slice(0, 4).map((item) => item.nodeId));
    expect(plan.warnings).toContain("1 ungrouped topic assignments were recovered from shared grounded anchors");
    for (const label of plan.nodeLabels.slice(0, 4)) {
      expect(label.keywords).toHaveLength(8);
      expect(sanitizeTopicNodeLabel(label).keywords?.[0]).toBe("Orion");
    }
    const map = buildDistinctIntegrityMap(fixture, plan);
    expect(evaluateReaderSummaryTopicMapStructure(map)).toMatchObject({
      passed: true, metrics: { nodeCount: 8, groupedCoverage: 0.5 },
    });
    expect(map.nodes.map((node) => node.storyClusterIds)).toEqual(fixture.params.clusters.map((cluster) => [cluster.id]));
    expect(map.nodes.map((node) => node.citationIds)).toEqual(fixture.params.citationMap.map((citation) => [citation.citationId]));
    expect(map.nodes.slice(0, 4).every((node) => node.keywords[0] === "Orion" && node.keywords.length === 8)).toBe(true);
    expect(map.groups.find((group) => group.id === "group:orion")?.nodeIds).toEqual(map.nodes.slice(0, 4).map((node) => node.id));
  });

  it.each([["Orion", "Orion"], ["SDK", "SDK"], ["orion", "Orion"], ["OpenBeacon", "OpenBeacon"]])("retains warranted %s in accepted display form %s within eight slots", (anchor, display) => {
    const fixture = topicIntegrityFixture(["Beacon", "Harbor"], [`${anchor} Beacon`, `${anchor} Harbor`], [fullKeywords, fullKeywords]);
    const plan = normalizeIntegrityFixture(fixture);
    const grounded = groundReaderSummaryTopicNodeLabel({
      nodeLabel: sanitizeTopicNodeLabel(plan.nodeLabels[0]!),
      selectedLabel: "Beacon",
      evidenceTexts: [`${anchor} Beacon research ${fullKeywords.join(" ")}`],
      providerLabels: ["rss"], candidateLabels: ["Beacon"],
    });
    expect(grounded?.keywords?.[0]).toBe(display);
    expect(grounded?.keywords).toHaveLength(8);
    const map = buildDistinctIntegrityMap(fixture, plan);
    expect(map.nodes).toHaveLength(2);
    expect(map.nodes.every((node) => node.groupId !== ungrouped && node.keywords.includes(display))).toBe(true);
    expect(evaluateReaderSummaryTopicMapStructure(map).passed).toBe(true);
  });

  it("recovers the evidence display token from a punctuated candidate identity", () => {
    const fixture = topicIntegrityFixture(["Beacon", "Harbor"], ["Orion/Beacon", "Orion/Harbor"], [fullKeywords, fullKeywords]);
    const plan = normalizeIntegrityFixture(fixture);
    expect(plan.nodeLabels.every((label) => label.keywords?.[0] === "Orion")).toBe(true);
    expect(buildDistinctIntegrityMap(fixture, plan).nodes.every((node) => node.groupId === "group:orion")).toBe(true);
  });

  it("does not recover a candidate anchor unsupported by actual builder evidence", () => {
    const fixture = topicIntegrityFixture(["Beacon", "Harbor"], ["Orion Beacon", "Orion Harbor"], [fullKeywords, fullKeywords]);
    fixture.params.selectedEvidence.forEach((item) => { item.bodyPreview = "Independent research."; });
    const map = buildDistinctIntegrityMap(fixture);
    expect(map.nodes).toHaveLength(2);
    expect(map.nodes.every((node) => node.groupId === ungrouped && !node.keywords.includes("Orion"))).toBe(true);
  });

  it.each([0.2, 0.549, Number.NaN])("keeps excluded confidence %s ungrouped through leading-identity recovery", (confidenceScore) => {
    const fixture = topicIntegrityFixture(["Orion Beacon", "Orion Harbor", "Orion Nimbus"]);
    fixture.rawLabels.forEach((label, index) => {
      label.groupId = "group:orion";
      label.keywords = ["Orion"];
      label.confidenceScore = index < 2 ? 0.95 : confidenceScore;
    });
    const plan = normalizeIntegrityFixture(fixture);
    expect(plan.nodeLabels[2]?.groupId).toBe(ungrouped);
    const map = buildDistinctIntegrityMap(fixture, plan);
    expect(map.nodes.map((node) => node.groupId)).toEqual(["group:orion", "group:orion", ungrouped]);
    expect(evaluateReaderSummaryTopicMapStructure(map).passed).toBe(true);
  });

  it("keeps 3/8 below publication coverage when the fourth cohort member is excluded", () => {
    const fixture = partialCohort();
    fixture.rawLabels[3]!.confidenceScore = 0.2;
    const map = buildDistinctIntegrityMap(fixture);
    expect(map.nodes).toHaveLength(8);
    expect(evaluateReaderSummaryTopicMapStructure(map)).toMatchObject({
      passed: true, metrics: { groupedCoverage: 0.375 },
    });
    expect(map.nodes[3]?.groupId).toBe(ungrouped);
  });

  it("treats missing confidence as exclusion while retaining warranted normal groups", () => {
    const fixture = topicIntegrityFixture(["Orion Beacon", "Orion Harbor", "Orion Nimbus"]);
    fixture.rawLabels.forEach((label) => { label.groupId = "group:orion"; label.keywords = ["Orion"]; });
    const plan = normalizeAgentRuntimeReaderSummaryTopicLabelPlan({
      nodeLabels: fixture.rawLabels.map((label, index) => ({ ...label, confidenceScore: index === 2 ? undefined : 0.95 })), groups: [],
    }, fixture.candidates);
    expect(buildDistinctIntegrityMap(fixture, plan).nodes.map((node) => node.groupId)).toEqual(["group:orion", "group:orion", ungrouped]);
    fixture.rawLabels[2]!.confidenceScore = 0.55;
    expect(buildDistinctIntegrityMap(fixture).nodes.every((node) => node.groupId === "group:orion")).toBe(true);
  });

  it("never steals conflicting members, including a conflicting singleton demoted by normalization", () => {
    const fixture = partialCohort();
    fixture.rawLabels.slice(0, 3).forEach((label) => { label.groupId = "group:beacon"; });
    expect(normalizeIntegrityFixture(fixture).nodeLabels[3]?.groupId).toBe(ungrouped);
    fixture.rawLabels[0]!.groupId = "group:orion";
    fixture.rawLabels[1]!.groupId = "group:orion";
    fixture.rawLabels[2]!.groupId = "group:quartz";
    const plan = normalizeIntegrityFixture(fixture);
    expect(plan.nodeLabels.map((label) => label.groupId)).toEqual([
      "group:orion", "group:orion", ungrouped, "group:orion", ungrouped, ungrouped, ungrouped, ungrouped,
    ]);
    const map = buildDistinctIntegrityMap(fixture, plan);
    expect(map.nodes.find((node) => node.storyClusterIds.includes(fixture.params.clusters[2]!.id))?.groupId).toBe(ungrouped);
  });

  it("does not create cohorts from incidental references, generic anchors or singletons", () => {
    for (const fixture of [
      topicIntegrityFixture(["Beacon", "Harbor"], ["Beacon", "Harbor"], [["Orion"], ["Orion"]]),
      topicIntegrityFixture(["Beacon", "Harbor"], ["AI Models", "AI Tools"]),
      topicIntegrityFixture(["Beacon"], ["Orion Beacon"]),
    ]) {
      expect(buildGroundedTopicCohortsForCandidates(fixture.candidates)).toHaveLength(0);
      expect(buildDistinctIntegrityMap(fixture).nodes.every((node) => node.groupId === ungrouped)).toBe(true);
    }
  });

  it("still rejects a four-member cohort when anchor discrimination is only 4/7", () => {
    const fixture = partialCohort();
    fixture.rawLabels.slice(0, 7).forEach((label) => { label.keywords = ["Orion"]; });
    fixture.params.selectedEvidence.slice(4, 7).forEach((item) => { item.bodyPreview += " Incidental Orion reference."; });
    const plan = normalizeIntegrityFixture(fixture);
    expect(plan.nodeLabels.filter((label) => label.groupId !== ungrouped)).toHaveLength(4);
    const map = buildDistinctIntegrityMap(fixture, plan);
    expect(evaluateReaderSummaryTopicMapStructure(map).metrics.groupedCoverage).toBe(0);
  });

  it("does not exceed the eight-group or eighteen-node bound during cohort recovery", () => {
    const names = ["Orion", "Lyra", "Vega", "Deneb", "Rigel", "Mizar", "Polaris", "Altair", "Sirius"];
    const fixture = topicIntegrityFixture(names.flatMap((name) => [name, name]));
    fixture.rawLabels.forEach((label, index) => { label.groupId = index < 16 ? `group:${names[Math.floor(index / 2)]!.toLowerCase()}` : ungrouped; });
    const plan = normalizeIntegrityFixture(fixture);
    expect(plan.groups).toHaveLength(READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS);
    expect(plan.nodeLabels.slice(16).every((label) => label.groupId === ungrouped)).toBe(true);
    const map = buildDistinctIntegrityMap(fixture, plan);
    expect(map.nodes).toHaveLength(READER_SUMMARY_TOPIC_MAP_MAX_NODES);
    expect(map.groups.filter((group) => group.id !== ungrouped).length).toBeLessThanOrEqual(8);
  });
});
