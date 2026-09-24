final class ReaderSummaryArtifactBinding {
  const ReaderSummaryArtifactBinding({
    this.tenantId,
    this.workspaceId,
    this.sourceItemIdsByCitation = const {},
    this.feedItemIdsByCitation = const {},
    this.providerKeysByCitation = const {},
    required this.artifactId,
    required this.sourceWindowId,
    required this.periodStart,
    required this.periodEnd,
    required this.ingestionCutoff,
    this.exactIngestionCutoff,
  });

  final String? tenantId;
  final String? workspaceId;
  final Map<String, String> sourceItemIdsByCitation;
  final Map<String, String> feedItemIdsByCitation;
  final Map<String, String> providerKeysByCitation;
  final String artifactId;
  final String sourceWindowId;
  final DateTime periodStart;
  final DateTime periodEnd;
  final DateTime? ingestionCutoff;
  final String? exactIngestionCutoff;
}
