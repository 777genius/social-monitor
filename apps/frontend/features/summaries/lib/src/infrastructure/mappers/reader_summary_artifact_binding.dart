final class ReaderSummaryArtifactBinding {
  const ReaderSummaryArtifactBinding({
    required this.artifactId,
    required this.sourceWindowId,
    required this.periodStart,
    required this.periodEnd,
    required this.ingestionCutoff,
  });

  final String artifactId;
  final String sourceWindowId;
  final DateTime periodStart;
  final DateTime periodEnd;
  final DateTime? ingestionCutoff;
}
