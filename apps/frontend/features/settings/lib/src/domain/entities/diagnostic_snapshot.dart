final class DiagnosticSnapshot {
  const DiagnosticSnapshot({
    required this.traceId,
    required this.routeId,
    required this.releaseVersion,
    required this.featureSnapshot,
    required this.safeCopyText,
  });

  final String traceId;
  final String routeId;
  final String releaseVersion;
  final String featureSnapshot;
  final String safeCopyText;
}
