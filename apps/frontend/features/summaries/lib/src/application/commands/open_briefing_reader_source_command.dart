final class OpenBriefingReaderSourceCommand {
  const OpenBriefingReaderSourceCommand({
    required this.briefingId,
    required this.kind,
    required this.label,
    required this.canonicalUrl,
    required this.idempotencyKey,
  });

  final String briefingId;
  final String kind;
  final String label;
  final String? canonicalUrl;
  final String idempotencyKey;
}
