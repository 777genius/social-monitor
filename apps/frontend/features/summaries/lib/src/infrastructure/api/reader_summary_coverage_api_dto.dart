part of 'summary_api_dto.dart';

final class ReaderSummaryCoverageApiDto {
  const ReaderSummaryCoverageApiDto({
    required this.selectedFeedItemCount,
    required this.topReadCount,
    required this.citationCount,
    this.lowRelevanceFeedItemCount = 0,
    this.mutedFeedItemCount = 0,
    this.userRatedFeedItemCount = 0,
    this.collectedFeedItemCount,
    this.providerBreakdown = const [],
    this.topicBreakdown = const [],
    this.queryBreakdown = const [],
  });

  final int selectedFeedItemCount;
  final int topReadCount;
  final int citationCount;
  final int lowRelevanceFeedItemCount;
  final int mutedFeedItemCount;
  final int userRatedFeedItemCount;
  final int? collectedFeedItemCount;
  final List<ReaderSummaryProviderCoverageApiDto> providerBreakdown;
  final List<ReaderSummaryTopicCoverageApiDto> topicBreakdown;
  final List<ReaderSummaryQueryCoverageApiDto> queryBreakdown;
}

final class ReaderSummaryProviderCoverageApiDto {
  const ReaderSummaryProviderCoverageApiDto({
    required this.providerKey,
    required this.selectedFeedItemCount,
    required this.topReadCount,
    required this.citationCount,
    this.lowRelevanceFeedItemCount = 0,
    this.mutedFeedItemCount = 0,
    this.userRatedFeedItemCount = 0,
    this.collectedFeedItemCount,
  });

  final String providerKey;
  final int selectedFeedItemCount;
  final int topReadCount;
  final int citationCount;
  final int lowRelevanceFeedItemCount;
  final int mutedFeedItemCount;
  final int userRatedFeedItemCount;
  final int? collectedFeedItemCount;
}

final class ReaderSummaryTopicCoverageApiDto {
  const ReaderSummaryTopicCoverageApiDto({
    required this.topicKey,
    required this.collectedFeedItemCount,
    this.topicLabel,
    this.lowRelevanceFeedItemCount = 0,
    this.mutedFeedItemCount = 0,
    this.userRatedFeedItemCount = 0,
  });

  final String topicKey;
  final String? topicLabel;
  final int collectedFeedItemCount;
  final int lowRelevanceFeedItemCount;
  final int mutedFeedItemCount;
  final int userRatedFeedItemCount;
}

final class ReaderSummaryQueryCoverageApiDto {
  const ReaderSummaryQueryCoverageApiDto({
    required this.query,
    required this.collectedFeedItemCount,
    this.lowRelevanceFeedItemCount = 0,
    this.mutedFeedItemCount = 0,
    this.userRatedFeedItemCount = 0,
  });

  final String query;
  final int collectedFeedItemCount;
  final int lowRelevanceFeedItemCount;
  final int mutedFeedItemCount;
  final int userRatedFeedItemCount;
}
