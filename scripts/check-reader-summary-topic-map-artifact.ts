import { readFileSync } from "node:fs";

import {
  evaluateReaderSummaryTopicMapStructure,
  evaluateTopicLabelQuality,
  type ReaderSummaryTopicMap,
} from "@social-monitor/summary/domain";

type ArtifactCheckReport = {
  readonly artifactFormat: "reader-summary-topic-map-artifact-check-v1";
  readonly inputPath: string;
  readonly generatedBy: ReaderSummaryTopicMap["generatedBy"];
  readonly confidence: ReaderSummaryTopicMap["confidence"];
  readonly structure: ReturnType<typeof evaluateReaderSummaryTopicMapStructure>;
  readonly coverageGate: {
    readonly minimum: number;
    readonly actual: number;
    readonly passed: boolean;
  };
  readonly groups: readonly {
    readonly id: string;
    readonly label: string;
    readonly nodeCount: number;
  }[];
  readonly rejectedNodeLabels: readonly {
    readonly label: string;
    readonly reasons: readonly string[];
  }[];
  readonly warnings: readonly string[];
  readonly passed: boolean;
};

const inputPath = optionValue("--path");
if (inputPath === undefined) {
  throw new Error("--path <reader-summary-artifact.json> is required");
}

const topicMap = readTopicMap(inputPath);
const structure = evaluateReaderSummaryTopicMapStructure(topicMap);
const minimumGroupedCoverage =
  topicMap.generatedBy === "agent-runtime" && topicMap.nodes.length >= 4
    ? 0.5
    : 0;
const coverageGate = {
  minimum: minimumGroupedCoverage,
  actual: structure.metrics.groupedCoverage,
  passed: structure.metrics.groupedCoverage >= minimumGroupedCoverage,
};
const rejectedNodeLabels = topicMap.nodes.flatMap((node) => {
  const quality = evaluateTopicLabelQuality(node.label);

  return quality.accepted
    ? []
    : [{ label: node.label, reasons: quality.reasons }];
});
const report = {
  artifactFormat: "reader-summary-topic-map-artifact-check-v1",
  inputPath,
  generatedBy: topicMap.generatedBy,
  confidence: topicMap.confidence,
  structure,
  coverageGate,
  groups: topicMap.groups.map((group) => ({
    id: group.id,
    label: group.label,
    nodeCount: group.nodeIds.length,
  })),
  rejectedNodeLabels,
  warnings: topicMap.warnings,
  passed:
    structure.passed &&
    coverageGate.passed &&
    rejectedNodeLabels.length === 0,
} satisfies ArtifactCheckReport;

console.log(JSON.stringify(report, null, 2));
if (!report.passed) {
  process.exitCode = 1;
}

function readTopicMap(path: string): ReaderSummaryTopicMap {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  const topicMap = topicMapFromUnknown(parsed);
  if (topicMap === undefined) {
    throw new Error("Input JSON does not contain a reader summary topic map");
  }

  return topicMap;
}

function topicMapFromUnknown(
  value: unknown,
): ReaderSummaryTopicMap | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (value.schemaVersion === "reader_summary.topic_map.v1") {
    return value as ReaderSummaryTopicMap;
  }
  const readerSummaryArtifact = isRecord(value.readerSummaryArtifact)
    ? value.readerSummaryArtifact
    : value;
  const content = isRecord(readerSummaryArtifact.content)
    ? readerSummaryArtifact.content
    : undefined;

  return isRecord(content?.topicMap)
    ? (content.topicMap as ReaderSummaryTopicMap)
    : undefined;
}

function optionValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1]?.trim();

  return value === undefined || value.length === 0 ? undefined : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
