final class ReaderAction {
  const ReaderAction({
    required this.kind,
    required this.label,
    required this.reason,
    required this.citationIds,
    this.canonicalUrl,
  });

  final String kind;
  final String label;
  final String reason;
  final List<String> citationIds;
  final String? canonicalUrl;
}
