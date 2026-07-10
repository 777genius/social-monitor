export type ReaderSummaryTopicMapSchemaVersion = "reader_summary.topic_map.v1";

export type ReaderSummaryTopicMapGenerator = "deterministic" | "agent-runtime";

export const READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID = "group:ungrouped";

export type ReaderSummaryTopicMapConfidence = {
  readonly level: "low" | "medium" | "high";
  readonly score: number;
  readonly rationale: string;
};

export type ReaderSummaryTopicMapNode = {
  readonly id: string;
  readonly label: string;
  readonly groupId: string;
  readonly storyClusterIds: readonly string[];
  readonly popularityScore: number;
  readonly sizeWeight: number;
  readonly evidenceCount: number;
  readonly providerKeys: readonly string[];
  readonly interestIds: readonly string[];
  readonly citationIds: readonly string[];
  readonly keywords: readonly string[];
  readonly rationale: string;
};

export type ReaderSummaryTopicMapGroup = {
  readonly id: string;
  readonly label: string;
  readonly colorKey: string;
  readonly semanticAnchors?: readonly string[];
  readonly nodeIds: readonly string[];
  readonly confidence: ReaderSummaryTopicMapConfidence;
};

export type ReaderSummaryTopicMapEdge = {
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly weight: number;
  readonly reason: string;
};

export type ReaderSummaryTopicMap = {
  readonly schemaVersion: ReaderSummaryTopicMapSchemaVersion;
  readonly generatedBy: ReaderSummaryTopicMapGenerator;
  readonly confidence: ReaderSummaryTopicMapConfidence;
  readonly nodes: readonly ReaderSummaryTopicMapNode[];
  readonly groups: readonly ReaderSummaryTopicMapGroup[];
  readonly edges: readonly ReaderSummaryTopicMapEdge[];
  readonly warnings: readonly string[];
};

export const emptyReaderSummaryTopicMap = (
  warnings: readonly string[] = [],
): ReaderSummaryTopicMap => ({
  schemaVersion: "reader_summary.topic_map.v1",
  generatedBy: "deterministic",
  confidence: {
    level: "low",
    score: 0,
    rationale: "No topic evidence was available for the summary window.",
  },
  nodes: [],
  groups: [],
  edges: [],
  warnings,
});
