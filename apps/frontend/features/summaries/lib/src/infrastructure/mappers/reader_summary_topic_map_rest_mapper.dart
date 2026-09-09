import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;

import '../api/summary_api_dto.dart';

final class ReaderSummaryTopicMapRestMapper {
  const ReaderSummaryTopicMapRestMapper();

  ReaderSummaryTopicMapApiDto map(
    generated.ReaderSummaryTopicMapDto dto,
  ) {
    return ReaderSummaryTopicMapApiDto(
      generatedBy: dto.generatedBy.json ?? 'deterministic',
      confidence: _topicMapConfidence(dto.confidence),
      nodes: dto.nodes.map(_topicMapNode).toList(growable: false),
      groups: dto.groups.map(_topicMapGroup).toList(growable: false),
      edges: dto.edges.map(_topicMapEdge).toList(growable: false),
      warnings: dto.warnings,
    );
  }

  ReaderSummaryTopicMapConfidenceApiDto _topicMapConfidence(
    generated.ReaderSummaryTopicMapConfidenceDto dto,
  ) {
    return ReaderSummaryTopicMapConfidenceApiDto(
      level: dto.level.json ?? 'low',
      score: _safeConfidenceScore(dto.score),
      rationale: dto.rationale,
    );
  }

  ReaderSummaryTopicMapNodeApiDto _topicMapNode(
    generated.ReaderSummaryTopicMapNodeDto dto,
  ) {
    return ReaderSummaryTopicMapNodeApiDto(
      id: dto.id,
      label: dto.label,
      groupId: dto.groupId,
      storyClusterIds: dto.storyClusterIds,
      popularityScore: _safeScore(dto.popularityScore),
      sizeWeight: _safeConfidenceScore(dto.sizeWeight),
      evidenceCount: _safeCount(dto.evidenceCount),
      providerKeys: dto.providerKeys,
      interestIds: dto.interestIds,
      citationIds: dto.citationIds,
      keywords: dto.keywords,
      rationale: dto.rationale,
    );
  }

  ReaderSummaryTopicMapGroupApiDto _topicMapGroup(
    generated.ReaderSummaryTopicMapGroupDto dto,
  ) {
    return ReaderSummaryTopicMapGroupApiDto(
      id: dto.id,
      label: dto.label,
      colorKey: dto.colorKey,
      nodeIds: dto.nodeIds,
      confidence: _topicMapConfidence(dto.confidence),
    );
  }

  ReaderSummaryTopicMapEdgeApiDto _topicMapEdge(
    generated.ReaderSummaryTopicMapEdgeDto dto,
  ) {
    return ReaderSummaryTopicMapEdgeApiDto(
      sourceNodeId: dto.sourceNodeId,
      targetNodeId: dto.targetNodeId,
      weight: _safeConfidenceScore(dto.weight),
      reason: dto.reason,
    );
  }

  int _safeCount(num value) {
    if (!value.isFinite || value < 0) {
      return 0;
    }
    return value.round();
  }

  double _safeScore(num value) {
    if (!value.isFinite || value < 0) {
      return 0;
    }
    return value.toDouble();
  }

  double _safeConfidenceScore(num value) {
    if (!value.isFinite || value < 0) {
      return 0;
    }
    if (value > 1) {
      return 1;
    }
    return value.toDouble();
  }
}
