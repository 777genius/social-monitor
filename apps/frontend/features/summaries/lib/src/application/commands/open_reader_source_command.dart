final class OpenReaderSourceCommand {
  const OpenReaderSourceCommand({
    required this.summaryId,
    required this.kind,
    required this.label,
    required this.canonicalUrl,
    required this.idempotencyKey,
  });

  final String summaryId;
  final String kind;
  final String label;
  final String? canonicalUrl;
  final String idempotencyKey;
}
