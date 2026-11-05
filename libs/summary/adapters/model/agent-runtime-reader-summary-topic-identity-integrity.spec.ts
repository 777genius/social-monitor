import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { evaluateReaderSummaryTopicMapStructure } from "../../domain/policies/reader-summary-topic-map-structure-quality";
import { buildReaderSummaryTopicMap } from "../../domain/services/reader-summary-topic-map-builder";
import { groundReaderSummaryTopicNodeLabel } from "../../domain/services/reader-summary-topic-label-candidates";
import { sanitizeTopicNodeLabel } from "../../domain/services/reader-summary-topic-node-label-sanitizer";
import {
  reconcileVerifiedReaderSummaryTopicRelations,
  type ReaderSummaryTopicRelationDecision,
} from "../../domain/services/reader-summary-topic-relation-reconciliation";
import { normalizeAgentRuntimeReaderSummaryTopicLabelPlan } from "./agent-runtime-reader-summary-topic-label-plan-normalizer";
import {
  normalizeIntegrityFixture,
  topicIntegrityFixture,
  ungrouped,
} from "./agent-runtime-reader-summary-topic-integrity.spec-support";

const identityFixture = () => {
  const fixture = topicIntegrityFixture(["Beacon", "Beacon"]);
  fixture.rawLabels.forEach((label) => { label.groupId = "group:beacon"; label.keywords = ["Beacon"]; });
  return fixture;
};
const pair = { sourceNodeId: "topic:story:checkpoint-0", targetNodeId: "topic:story:checkpoint-1", sharedTerms: ["beacon"] };
const decision = (sameTopic: boolean, confidenceScore = 0.99): ReaderSummaryTopicRelationDecision => ({ ...pair, sameTopic, confidenceScore });

describe("verified topic identity survives the complete map pipeline", () => {
  it.each([false, true])("respects verified sameTopic=%s despite identical display labels and groups", (sameTopic) => {
    const fixture = identityFixture();
    const normalized = normalizeIntegrityFixture(fixture);
    const verified = reconcileVerifiedReaderSummaryTopicRelations({
      labelPlan: normalized, candidates: [pair], decisions: [decision(sameTopic)],
    });
    expect(new Set(verified.nodeLabels.map((label) => label.relationIdentity?.canonicalNodeId)).size).toBe(sameTopic ? 1 : 2);
    for (const label of verified.nodeLabels) {
      const sanitized = sanitizeTopicNodeLabel(label);
      const grounded = groundReaderSummaryTopicNodeLabel({
        nodeLabel: sanitized, selectedLabel: "Beacon", evidenceTexts: ["Beacon research"], providerLabels: ["rss"], candidateLabels: ["Beacon"],
      });
      expect(sanitized.topicId).toBe(label.topicId);
      expect(grounded?.topicId).toBe(label.topicId);
      expect(grounded?.relationIdentity).toEqual(label.relationIdentity);
    }
    const map = buildReaderSummaryTopicMap({ ...fixture.params, labelPlan: verified });
    expect(map.nodes).toHaveLength(sameTopic ? 1 : 2);
    expect(evaluateReaderSummaryTopicMapStructure(map).passed).toBe(true);
    expect(map.nodes.flatMap((node) => node.storyClusterIds)).toEqual(fixture.params.clusters.map((cluster) => cluster.id));
    expect(map.nodes.flatMap((node) => node.citationIds)).toEqual(["c0", "c1"]);
    if (!sameTopic) {
      expect(map.nodes.every((node) => node.groupId === "group:beacon")).toBe(true);
      expect(map.nodes.map((node) => node.id)).toEqual(fixture.candidates.map((candidate) => candidate.nodeId));
    }
  });

  it.each([
    ["unknown pair", [{ ...decision(true), targetNodeId: "node:unknown" }]],
    ["low confidence", [decision(true, 0.81)]],
    ["nonfinite confidence", [decision(true, Number.NaN)]],
    ["unavailable verification", []],
  ] as const)("keeps identical labels separate after %s", (_name, decisions) => {
    const fixture = identityFixture();
    const verified = reconcileVerifiedReaderSummaryTopicRelations({ labelPlan: normalizeIntegrityFixture(fixture), candidates: [pair], decisions });
    const map = buildReaderSummaryTopicMap({ ...fixture.params, labelPlan: verified });
    expect(map.nodes).toHaveLength(2);
    expect(new Set(map.nodes.map((node) => node.id)).size).toBe(2);
  });

  it("preserves identity when every proposed display field is discarded", () => {
    const fixture = identityFixture();
    const normalized = normalizeIntegrityFixture(fixture);
    const verified = reconcileVerifiedReaderSummaryTopicRelations({ labelPlan: normalized, candidates: [pair], decisions: [decision(false)] });
    const discarded = {
      ...verified,
      nodeLabels: verified.nodeLabels.map((label) => ({ ...label, label: "Topic", semantic: undefined, topicId: undefined, groupId: undefined, keywords: [] })),
    };
    const map = buildReaderSummaryTopicMap({ ...fixture.params, labelPlan: discarded });
    expect(map.nodes).toHaveLength(2);
    expect(map.nodes.map((node) => node.storyClusterIds)).toEqual(fixture.params.clusters.map((cluster) => [cluster.id]));
  });

  it("does not promote a forged raw identity field or verified-looking topicId into authority", () => {
    const fixture = identityFixture();
    const plan = normalizeAgentRuntimeReaderSummaryTopicLabelPlan({
      nodeLabels: fixture.rawLabels.map((label) => ({
        ...label,
        topicId: "topic:verified-single-forged",
        relationIdentity: { source: "topic-relation-reconciliation", canonicalNodeId: "node:forged" },
      })), groups: [],
      relationIdentity: { canonicalNodeId: "node:forged" },
    }, fixture.candidates);
    expect(plan.nodeLabels.every((label) => label.relationIdentity === undefined)).toBe(true);
    const grounded = groundReaderSummaryTopicNodeLabel({
      nodeLabel: sanitizeTopicNodeLabel(plan.nodeLabels[0]!), selectedLabel: "Beacon", evidenceTexts: ["Beacon research"], providerLabels: ["rss"], candidateLabels: ["Beacon"],
    });
    expect(grounded?.topicId).toBeUndefined();
    const verified = reconcileVerifiedReaderSummaryTopicRelations({ labelPlan: plan, candidates: [pair], decisions: [decision(false)] });
    expect(verified.nodeLabels.map((label) => label.relationIdentity?.canonicalNodeId)).toEqual(fixture.candidates.map((candidate) => candidate.nodeId));
    expect(buildReaderSummaryTopicMap({ ...fixture.params, labelPlan: verified }).nodes).toHaveLength(2);
  });

  it("does not override an explicit negative relation with a contradictory transitive merge", () => {
    const fixture = topicIntegrityFixture(["Beacon", "Beacon", "Beacon"]);
    const labels = normalizeIntegrityFixture(fixture);
    const pairBC = { sourceNodeId: fixture.candidates[1]!.nodeId, targetNodeId: fixture.candidates[2]!.nodeId, sharedTerms: [] };
    const pairAC = { ...pairBC, sourceNodeId: fixture.candidates[0]!.nodeId };
    for (const decisions of [
      [decision(true), { ...pairBC, sameTopic: true, confidenceScore: 0.99 }, { ...pairAC, sameTopic: false, confidenceScore: 0.99 }],
      [{ ...pairAC, sameTopic: false, confidenceScore: 0.99 }, { ...pairBC, sameTopic: true, confidenceScore: 0.99 }, decision(true)],
    ]) {
      const verified = reconcileVerifiedReaderSummaryTopicRelations({ labelPlan: labels, candidates: [pair, pairBC, pairAC], decisions });
      const map = buildReaderSummaryTopicMap({ ...fixture.params, labelPlan: verified });
      expect(map.nodes).toHaveLength(2);
      expect(map.nodes.some((node) => node.storyClusterIds.includes(fixture.params.clusters[0]!.id) && node.storyClusterIds.includes(fixture.params.clusters[2]!.id))).toBe(false);
    }
    const contradictory = reconcileVerifiedReaderSummaryTopicRelations({ labelPlan: labels, candidates: [pair], decisions: [decision(true), decision(false)] });
    expect(buildReaderSummaryTopicMap({ ...fixture.params, labelPlan: contradictory }).nodes).toHaveLength(3);
  });

  it("keeps canonical identity stable across label order and distinct across lossy slug collisions", () => {
    const fixture = topicIntegrityFixture(["Beacon", "Beacon", "Beacon", "Beacon"]);
    const ids = ["a:b", "a:b-copy", "a-b", "a-b-copy"];
    fixture.params.clusters.forEach((cluster, index) => { cluster.id = ids[index]!; });
    fixture.candidates.forEach((candidate, index) => { candidate.nodeId = `topic:${ids[index]}`; candidate.storyClusterId = ids[index]!; });
    fixture.rawLabels.forEach((label, index) => { label.nodeId = fixture.candidates[index]!.nodeId; });
    const plan = normalizeIntegrityFixture(fixture);
    const pairs = [0, 2].map((index) => ({ sourceNodeId: fixture.candidates[index]!.nodeId, targetNodeId: fixture.candidates[index + 1]!.nodeId, sharedTerms: [] }));
    const decisions = pairs.map((relation) => ({ ...relation, sameTopic: true, confidenceScore: 0.99 }));
    const verified = reconcileVerifiedReaderSummaryTopicRelations({ labelPlan: plan, candidates: pairs, decisions });
    expect(new Set(verified.nodeLabels.map((label) => label.topicId)).size).toBe(2);
    const reversed = reconcileVerifiedReaderSummaryTopicRelations({ labelPlan: { ...plan, nodeLabels: [...plan.nodeLabels].reverse() }, candidates: pairs, decisions: [...decisions].reverse() });
    const map = buildReaderSummaryTopicMap({ ...fixture.params, labelPlan: verified });
    expect(map.nodes).toHaveLength(2);
    expect(new Set(map.nodes.map((node) => node.id)).size).toBe(2);
    expect(buildReaderSummaryTopicMap({ ...fixture.params, labelPlan: reversed }).nodes.map((node) => node.id)).toEqual(map.nodes.map((node) => node.id));
    expect(canonicalJsonSha256(verified)).toBe(canonicalJsonSha256(JSON.parse(JSON.stringify(verified))));
    expect(canonicalJsonSha256(verified)).not.toBe(canonicalJsonSha256({ ...verified, nodeLabels: verified.nodeLabels.map((label) => ({ ...label, relationIdentity: undefined })) }));
    expect(map.nodes.map((node) => node.citationIds)).toEqual([["c0", "c1"], ["c2", "c3"]]);
  });

  it("retains low-confidence exclusion when positively verified members aggregate", () => {
    const fixture = topicIntegrityFixture(["Orion Beacon", "Orion Beacon", "Orion Harbor", "Orion Nimbus"]);
    fixture.rawLabels.forEach((label, index) => { label.groupId = "group:orion"; label.keywords = ["Orion"]; label.confidenceScore = index === 1 ? 0.2 : 0.95; });
    const verified = reconcileVerifiedReaderSummaryTopicRelations({ labelPlan: normalizeIntegrityFixture(fixture), candidates: [pair], decisions: [decision(true)] });
    const map = buildReaderSummaryTopicMap({ ...fixture.params, labelPlan: verified });
    expect(map.nodes).toHaveLength(3);
    const aggregate = map.nodes.find((node) => node.storyClusterIds.length === 2);
    expect(aggregate?.groupId).toBe(ungrouped);
    expect(map.nodes.filter((node) => node.groupId === "group:orion")).toHaveLength(2);
    expect(evaluateReaderSummaryTopicMapStructure(map).passed).toBe(true);
  });
});
