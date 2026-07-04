final class ReaderSummaryCoverage {
  const ReaderSummaryCoverage({
    required this.selectedFeedItemCount,
    required this.topReadCount,
    required this.citationCount,
    this.collectedFeedItemCount,
    this.providerBreakdown = const [],
  });

  final int selectedFeedItemCount;
  final int topReadCount;
  final int citationCount;
  final int? collectedFeedItemCount;
  final List<ReaderSummaryProviderCoverage> providerBreakdown;
}

final class ReaderSummaryProviderCoverage {
  const ReaderSummaryProviderCoverage({
    required this.providerKey,
    required this.selectedFeedItemCount,
    required this.topReadCount,
    required this.citationCount,
    this.collectedFeedItemCount,
  });

  final String providerKey;
  final int selectedFeedItemCount;
  final int topReadCount;
  final int citationCount;
  final int? collectedFeedItemCount;
}
