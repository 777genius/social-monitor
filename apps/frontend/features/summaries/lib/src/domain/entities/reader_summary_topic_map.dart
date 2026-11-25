final class ReaderSummaryTopicMap {
  const ReaderSummaryTopicMap({
    required this.generatedBy,
    required this.confidence,
    required this.nodes,
    required this.groups,
    required this.edges,
    required this.warnings,
  });

  final String generatedBy;
  final ReaderSummaryTopicMapConfidence confidence;
  final List<ReaderSummaryTopicMapNode> nodes;
  final List<ReaderSummaryTopicMapGroup> groups;
  final List<ReaderSummaryTopicMapEdge> edges;
  final List<String> warnings;

  bool get isEmpty => nodes.isEmpty;
}

final class ReaderSummaryTopicMapConfidence {
  const ReaderSummaryTopicMapConfidence({
    required this.level,
    required this.score,
    required this.rationale,
  });

  final String level;
  final double score;
  final String rationale;
}

final class ReaderSummaryTopicMapNode {
  const ReaderSummaryTopicMapNode({
    required this.id,
    required this.label,
    required this.groupId,
    required this.storyClusterIds,
    required this.popularityScore,
    required this.sizeWeight,
    required this.evidenceCount,
    required this.providerKeys,
    required this.interestIds,
    required this.citationIds,
    required this.keywords,
    required this.rationale,
  });

  final String id;
  final String label;
  final String groupId;
  final List<String> storyClusterIds;
  final double popularityScore;
  final double sizeWeight;
  final int evidenceCount;
  final List<String> providerKeys;
  final List<String> interestIds;
  final List<String> citationIds;
  final List<String> keywords;
  final String rationale;
}

final class ReaderSummaryTopicMapGroup {
  const ReaderSummaryTopicMapGroup({
    required this.id,
    required this.label,
    required this.colorKey,
    required this.nodeIds,
    required this.confidence,
  });

  final String id;
  final String label;
  final String colorKey;
  final List<String> nodeIds;
  final ReaderSummaryTopicMapConfidence confidence;
}

final class ReaderSummaryTopicMapEdge {
  const ReaderSummaryTopicMapEdge({
    required this.sourceNodeId,
    required this.targetNodeId,
    required this.weight,
    required this.reason,
  });

  final String sourceNodeId;
  final String targetNodeId;
  final double weight;
  final String reason;
}

const emptyReaderSummaryTopicMap = ReaderSummaryTopicMap(
  generatedBy: 'deterministic',
  confidence: ReaderSummaryTopicMapConfidence(
    level: 'low',
    score: 0,
    rationale: 'No topic evidence is available.',
  ),
  nodes: [],
  groups: [],
  edges: [],
  warnings: [],
);
