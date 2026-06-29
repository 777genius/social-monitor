final class SourceMixEntry {
  const SourceMixEntry({
    required this.providerKey,
    required this.itemCount,
    required this.citationCount,
    required this.storyClusterCount,
    required this.crossSourceClusterCount,
    required this.singleSourceOnly,
    required this.interestIds,
  });

  final String providerKey;
  final int itemCount;
  final int citationCount;
  final int storyClusterCount;
  final int crossSourceClusterCount;
  final bool singleSourceOnly;
  final List<String> interestIds;
}
