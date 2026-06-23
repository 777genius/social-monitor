final class DiagnosticSnapshotApiDto {
  const DiagnosticSnapshotApiDto({
    required this.traceId,
    required this.routeId,
    required this.releaseVersion,
    required this.featureSnapshot,
  });

  final String traceId;
  final String routeId;
  final String releaseVersion;
  final String featureSnapshot;
}

final class WorkspaceSettingsApiDto {
  const WorkspaceSettingsApiDto({
    required this.workspaceRole,
    required this.digestFrequency,
    required this.telemetryConsent,
    required this.diagnostics,
  });

  final String workspaceRole;
  final String digestFrequency;
  final String telemetryConsent;
  final DiagnosticSnapshotApiDto diagnostics;
}
