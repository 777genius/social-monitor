final class ReaderSummaryCoverage {
  const ReaderSummaryCoverage({
    required this.selectedFeedItemCount,
    required this.topReadCount,
    required this.citationCount,
    required this.lowRelevanceFeedItemCount,
    required this.mutedFeedItemCount,
    required this.userRatedFeedItemCount,
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
  final ReaderSummaryCollectionCoverageState? collectionCoverageState;
  final List<String> degradedProviderKeys;
  final List<ReaderSummaryProviderCoverage> providerBreakdown;
  final List<ReaderSummaryTopicCoverage> topicBreakdown;
  final List<ReaderSummaryQueryCoverage> queryBreakdown;
}

final class ReaderSummaryProviderCoverage {
  const ReaderSummaryProviderCoverage({
    required this.providerKey,
    required this.selectedFeedItemCount,
    required this.topReadCount,
    required this.citationCount,
    required this.lowRelevanceFeedItemCount,
    required this.mutedFeedItemCount,
    required this.userRatedFeedItemCount,
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
  final ReaderSummaryProviderCollectionHealth? collectionHealth;
}

enum ReaderSummaryCollectionCoverageState {
  complete,
  partial,
  degraded,
  unavailable,
  unknown,
}

final class ReaderSummaryProviderCollectionHealth {
  const ReaderSummaryProviderCollectionHealth({
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

  final ReaderSummaryCollectionCoverageState state;
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

final class ReaderSummaryTopicCoverage {
  const ReaderSummaryTopicCoverage({
    required this.topicKey,
    this.topicLabel,
    required this.collectedFeedItemCount,
    required this.lowRelevanceFeedItemCount,
    required this.mutedFeedItemCount,
    required this.userRatedFeedItemCount,
  });

  final String topicKey;
  final String? topicLabel;
  final int collectedFeedItemCount;
  final int lowRelevanceFeedItemCount;
  final int mutedFeedItemCount;
  final int userRatedFeedItemCount;
}

final class ReaderSummaryQueryCoverage {
  const ReaderSummaryQueryCoverage({
    required this.query,
    required this.collectedFeedItemCount,
    required this.lowRelevanceFeedItemCount,
    required this.mutedFeedItemCount,
    required this.userRatedFeedItemCount,
  });

  final String query;
  final int collectedFeedItemCount;
  final int lowRelevanceFeedItemCount;
  final int mutedFeedItemCount;
  final int userRatedFeedItemCount;
}
