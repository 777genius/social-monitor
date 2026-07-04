final class SummaryCitation {
  const SummaryCitation({
    required this.id,
    required this.sourceLabel,
    required this.safeSnippet,
    required this.feedItemId,
    required this.sourceItemId,
    this.providerKey,
    this.canonicalUrl,
  });

  final String id;
  final String sourceLabel;
  final String safeSnippet;
  final String feedItemId;
  final String sourceItemId;
  final String? providerKey;
  final String? canonicalUrl;
}
