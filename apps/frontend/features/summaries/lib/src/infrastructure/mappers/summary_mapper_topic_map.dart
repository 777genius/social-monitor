part of 'summary_mapper.dart';

ReaderSummaryTopicMap _topicMapToDomain(
  SummaryMapper mapper,
  ReaderSummaryTopicMapApiDto dto,
) {
  final nodes = dto.nodes
      .map((node) => _topicMapNodeToDomain(mapper, node))
      .where((node) => node.id.isNotEmpty && node.label.isNotEmpty)
      .toList(growable: false);
  final nodeIds = nodes.map((node) => node.id).toSet();
  final groups = dto.groups
      .map((group) => _topicMapGroupToDomain(mapper, group))
      .where(
        (group) =>
            group.id.isNotEmpty &&
            group.label.isNotEmpty &&
            group.nodeIds.any(nodeIds.contains),
      )
      .toList(growable: false);
  final groupIds = groups.map((group) => group.id).toSet();
  final validNodes = nodes
      .where((node) => groupIds.contains(node.groupId))
      .toList(growable: false);
  final validNodeIds = validNodes.map((node) => node.id).toSet();

  return ReaderSummaryTopicMap(
    generatedBy: mapper._nonEmpty(dto.generatedBy, fallback: 'deterministic'),
    confidence: _topicMapConfidenceToDomain(mapper, dto.confidence),
    nodes: validNodes,
    groups: groups,
    edges: dto.edges
        .map((edge) => _topicMapEdgeToDomain(mapper, edge))
        .where(
          (edge) =>
              validNodeIds.contains(edge.sourceNodeId) &&
              validNodeIds.contains(edge.targetNodeId) &&
              edge.sourceNodeId != edge.targetNodeId,
        )
        .toList(growable: false),
    warnings: mapper._safeTextList(dto.warnings),
  );
}

ReaderSummaryTopicMapConfidence _topicMapConfidenceToDomain(
  SummaryMapper mapper,
  ReaderSummaryTopicMapConfidenceApiDto dto,
) {
  return ReaderSummaryTopicMapConfidence(
    level: switch (dto.level.trim().toLowerCase()) {
      'high' => 'high',
      'medium' => 'medium',
      _ => 'low',
    },
    score: mapper._boundedScore(dto.score),
    rationale: mapper._safeText(
      dto.rationale,
      fallback: 'Topic map confidence.',
    ),
  );
}

ReaderSummaryTopicMapNode _topicMapNodeToDomain(
  SummaryMapper mapper,
  ReaderSummaryTopicMapNodeApiDto dto,
) {
  return ReaderSummaryTopicMapNode(
    id: mapper._nonEmpty(dto.id, fallback: ''),
    label: mapper._safeText(dto.label, fallback: ''),
    groupId: mapper._nonEmpty(dto.groupId, fallback: ''),
    storyClusterIds: mapper._safeTextList(dto.storyClusterIds),
    popularityScore: dto.popularityScore < 0 ? 0.0 : dto.popularityScore,
    sizeWeight: mapper._boundedScore(dto.sizeWeight),
    evidenceCount: dto.evidenceCount < 0 ? 0 : dto.evidenceCount,
    providerKeys: mapper._safeTextList(dto.providerKeys),
    interestIds: mapper._safeTextList(dto.interestIds),
    citationIds: mapper._safeTextList(dto.citationIds),
    keywords: mapper._safeTextList(dto.keywords),
    rationale: mapper._safeText(
      dto.rationale,
      fallback: 'Related summary topic.',
    ),
  );
}

ReaderSummaryTopicMapGroup _topicMapGroupToDomain(
  SummaryMapper mapper,
  ReaderSummaryTopicMapGroupApiDto dto,
) {
  return ReaderSummaryTopicMapGroup(
    id: mapper._nonEmpty(dto.id, fallback: ''),
    label: mapper._safeText(dto.label, fallback: ''),
    colorKey: mapper._nonEmpty(dto.colorKey, fallback: 'blue'),
    nodeIds: mapper._safeTextList(dto.nodeIds),
    confidence: _topicMapConfidenceToDomain(mapper, dto.confidence),
  );
}

ReaderSummaryTopicMapEdge _topicMapEdgeToDomain(
  SummaryMapper mapper,
  ReaderSummaryTopicMapEdgeApiDto dto,
) {
  return ReaderSummaryTopicMapEdge(
    sourceNodeId: mapper._nonEmpty(dto.sourceNodeId, fallback: ''),
    targetNodeId: mapper._nonEmpty(dto.targetNodeId, fallback: ''),
    weight: mapper._boundedScore(dto.weight),
    reason: mapper._safeText(dto.reason, fallback: 'Related topics.'),
  );
}
