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
    this.collectionCoverageState,
    this.degradedProviderKeys = const [],
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
  final String? collectionCoverageState;
  final List<String> degradedProviderKeys;
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
    this.collectionHealth,
  });

  final String providerKey;
  final int selectedFeedItemCount;
  final int topReadCount;
  final int citationCount;
  final int lowRelevanceFeedItemCount;
  final int mutedFeedItemCount;
  final int userRatedFeedItemCount;
  final int? collectedFeedItemCount;
  final ReaderSummaryProviderCollectionHealthApiDto? collectionHealth;
}

final class ReaderSummaryProviderCollectionHealthApiDto {
  const ReaderSummaryProviderCollectionHealthApiDto({
    required this.state,
    required this.scanCount,
    required this.collectedItemCount,
    required this.acceptedItemCount,
    required this.insertedItemCount,
    required this.outsideWindowItemCount,
    required this.paginationDuplicateItemCount,
    required this.storageDuplicateItemCount,
    required this.pageCount,
    required this.paginationStopReasons,
    required this.failureKinds,
    required this.rateLimitEventCount,
    this.targetItemCount,
    this.oldestAcceptedPublishedAt,
    this.newestAcceptedPublishedAt,
  });

  final String state;
  final int scanCount;
  final int? targetItemCount;
  final int collectedItemCount;
  final int acceptedItemCount;
  final int insertedItemCount;
  final int outsideWindowItemCount;
  final int paginationDuplicateItemCount;
  final int storageDuplicateItemCount;
  final int pageCount;
  final List<String> paginationStopReasons;
  final List<String> failureKinds;
  final int rateLimitEventCount;
  final DateTime? oldestAcceptedPublishedAt;
  final DateTime? newestAcceptedPublishedAt;
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
