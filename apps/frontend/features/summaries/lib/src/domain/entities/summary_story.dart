final class SummaryStory {
  const SummaryStory({
    required this.storyClusterId,
    required this.title,
    required this.summary,
    required this.topicCount,
    required this.providerCount,
    required this.interestIds,
    required this.providerKeys,
    required this.citationIds,
  });

  final String storyClusterId;
  final String title;
  final String summary;
  final int topicCount;
  final int providerCount;
  final List<String> interestIds;
  final List<String> providerKeys;
  final List<String> citationIds;
}
