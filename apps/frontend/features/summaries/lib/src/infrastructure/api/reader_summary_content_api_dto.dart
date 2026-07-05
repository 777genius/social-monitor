part of 'summary_api_dto.dart';

final class ReaderSummaryContentApiDto {
  const ReaderSummaryContentApiDto({
    required this.headline,
    required this.oneLineTakeaway,
    required this.bullets,
    this.mainTopics = const [],
    this.topicMap = emptyReaderSummaryTopicMapApiDto,
    required this.interestSections,
    required this.sourceMix,
    required this.topReads,
    this.selectedPosts = const [],
    this.claimBoard = const [],
    this.reliabilityReport = emptySummaryReliabilityReportApiDto,
    required this.trendDelta,
    required this.openQuestions,
    required this.risks,
    required this.nextActions,
    this.qualityState = const ReaderSummaryQualityStateApiDto(
      status: 'ready',
      flags: [],
      warnings: [],
      isSingleSource: false,
    ),
  });

  final String headline;
  final String oneLineTakeaway;
  final List<String> bullets;
  final List<String> mainTopics;
  final ReaderSummaryTopicMapApiDto topicMap;
  final ReaderSummaryQualityStateApiDto qualityState;
  final List<ReaderInterestSectionApiDto> interestSections;
  final List<SourceMixEntryApiDto> sourceMix;
  final List<TopReadApiDto> topReads;
  final List<TopReadApiDto> selectedPosts;
  final List<SummaryClaimApiDto> claimBoard;
  final SummaryReliabilityReportApiDto reliabilityReport;
  final ReaderTrendDeltaApiDto trendDelta;
  final List<String> openQuestions;
  final List<String> risks;
  final List<ReaderActionApiDto> nextActions;
}

final class ReaderSummaryTopicMapApiDto {
  const ReaderSummaryTopicMapApiDto({
    required this.generatedBy,
    required this.confidence,
    required this.nodes,
    required this.groups,
    required this.edges,
    this.warnings = const [],
  });

  final String generatedBy;
  final ReaderSummaryTopicMapConfidenceApiDto confidence;
  final List<ReaderSummaryTopicMapNodeApiDto> nodes;
  final List<ReaderSummaryTopicMapGroupApiDto> groups;
  final List<ReaderSummaryTopicMapEdgeApiDto> edges;
  final List<String> warnings;
}

final class ReaderSummaryTopicMapConfidenceApiDto {
  const ReaderSummaryTopicMapConfidenceApiDto({
    required this.level,
    required this.score,
    required this.rationale,
  });

  final String level;
  final double score;
  final String rationale;
}

final class ReaderSummaryTopicMapNodeApiDto {
  const ReaderSummaryTopicMapNodeApiDto({
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

final class ReaderSummaryTopicMapGroupApiDto {
  const ReaderSummaryTopicMapGroupApiDto({
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
  final ReaderSummaryTopicMapConfidenceApiDto confidence;
}

final class ReaderSummaryTopicMapEdgeApiDto {
  const ReaderSummaryTopicMapEdgeApiDto({
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

const emptyReaderSummaryTopicMapApiDto = ReaderSummaryTopicMapApiDto(
  generatedBy: 'deterministic',
  confidence: ReaderSummaryTopicMapConfidenceApiDto(
    level: 'low',
    score: 0,
    rationale: 'No topic evidence is available.',
  ),
  nodes: [],
  groups: [],
  edges: [],
);
