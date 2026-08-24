import type { ReaderSummaryContent } from "./reader-summary-artifact";
import type { ReaderSummaryTopicMapConfidence } from "./reader-summary-topic-map";

export const assertReaderSummaryTopicMap = (
  topicMap: ReaderSummaryContent["topicMap"],
  knownCitationIds: ReadonlySet<string>,
  storyClusterIds: ReadonlySet<string>,
): void => {
  if (topicMap === undefined) return;
  if (topicMap.schemaVersion !== "reader_summary.topic_map.v1") {
    throw new Error("Reader summary topic map schema version is unsupported");
  }
  if (!["deterministic", "agent-runtime"].includes(topicMap.generatedBy)) {
    throw new Error("Reader summary topic map generator is unsupported");
  }
  assertBoundedConfidence(topicMap.confidence, "Reader summary topic map");

  const nodeIds = new Set(topicMap.nodes.map((node) => node.id));
  const groupIds = new Set(topicMap.groups.map((group) => group.id));
  for (const node of topicMap.nodes) {
    if (
      node.id.trim().length === 0 ||
      node.label.trim().length === 0 ||
      node.groupId.trim().length === 0 ||
      node.storyClusterIds.length === 0 ||
      node.providerKeys.length === 0 ||
      node.interestIds.length === 0 ||
      node.evidenceCount < 1 ||
      !Number.isFinite(node.popularityScore) ||
      node.popularityScore < 0 ||
      node.popularityScore > 100 ||
      !Number.isFinite(node.sizeWeight) ||
      node.sizeWeight < 0 ||
      node.sizeWeight > 1 ||
      node.rationale.trim().length === 0
    ) {
      throw new Error("Reader summary topic map nodes are invalid");
    }
    for (const storyClusterId of node.storyClusterIds) {
      if (!storyClusterIds.has(storyClusterId)) {
        throw new Error(
          "Reader summary topic map node references unknown story cluster",
        );
      }
    }
    assertCitationIds(node.citationIds, knownCitationIds);
  }

  for (const group of topicMap.groups) {
    if (
      group.id.trim().length === 0 ||
      group.label.trim().length === 0 ||
      group.colorKey.trim().length === 0 ||
      group.nodeIds.length === 0
    ) {
      throw new Error("Reader summary topic map groups are invalid");
    }
    assertBoundedConfidence(group.confidence, "Reader summary topic map group");
    for (const nodeId of group.nodeIds) {
      if (!nodeIds.has(nodeId)) {
        throw new Error("Reader summary topic map group references unknown node");
      }
    }
  }
  for (const node of topicMap.nodes) {
    if (!groupIds.has(node.groupId)) {
      throw new Error("Reader summary topic map node references unknown group");
    }
  }
  for (const edge of topicMap.edges) {
    if (
      !nodeIds.has(edge.sourceNodeId) ||
      !nodeIds.has(edge.targetNodeId) ||
      edge.sourceNodeId === edge.targetNodeId ||
      !Number.isFinite(edge.weight) ||
      edge.weight < 0 ||
      edge.weight > 1 ||
      edge.reason.trim().length === 0
    ) {
      throw new Error("Reader summary topic map edges are invalid");
    }
  }
};

export const assertReaderSummaryReliabilityReport = (
  report: ReaderSummaryContent["reliabilityReport"],
): void => {
  if (
    report.mode !== "shadow" ||
    report.policyVersion.trim().length === 0 ||
    !["low", "medium", "high"].includes(report.riskLevel) ||
    !Number.isFinite(report.riskScore) ||
    report.riskScore < 0 ||
    report.riskScore > 1
  ) {
    throw new Error(
      "Reader summary reliability report must include shadow mode and bounded risk score",
    );
  }
  for (const risk of report.risks) {
    if (
      ![
        "duplicate_risk",
        "stale_evidence",
        "single_source",
        "weak_source",
        "low_evidence_diversity",
      ].includes(risk.kind) ||
      !["low", "medium", "high"].includes(risk.level) ||
      !Number.isFinite(risk.score) ||
      risk.score < 0 ||
      risk.score > 1 ||
      risk.description.trim().length === 0
    ) {
      throw new Error(
        "Reader summary reliability risks must include kind, level and bounded score",
      );
    }
  }
};

const assertBoundedConfidence = (
  confidence: ReaderSummaryTopicMapConfidence,
  label: string,
): void => {
  if (
    !["low", "medium", "high"].includes(confidence.level) ||
    !Number.isFinite(confidence.score) ||
    confidence.score < 0 ||
    confidence.score > 1 ||
    confidence.rationale.trim().length === 0
  ) {
    throw new Error(`${label} confidence is invalid`);
  }
};

const assertCitationIds = (
  citationIds: readonly string[],
  knownCitationIds: ReadonlySet<string>,
): void => {
  for (const citationId of citationIds) {
    if (!knownCitationIds.has(citationId)) {
      throw new Error(
        "Reader summary topic map node cites evidence outside citation map",
      );
    }
  }
};
