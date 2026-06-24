final class SummaryCitation {
  const SummaryCitation({
    required this.id,
    required this.sourceLabel,
    required this.safeSnippet,
    this.canonicalUrl,
  });

  final String id;
  final String sourceLabel;
  final String safeSnippet;
  final String? canonicalUrl;
}
