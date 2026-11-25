final class SourceHealthApiDto {
  const SourceHealthApiDto({
    required this.sourceId,
    required this.summary,
    required this.checkedAtLabel,
    required this.issueCount,
    this.providerPayloadPreview,
  });

  final String sourceId;
  final String summary;
  final String checkedAtLabel;
  final int issueCount;
  final String? providerPayloadPreview;
}
