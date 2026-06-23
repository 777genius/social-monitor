import 'package:social_monitor_settings/src/domain/entities/diagnostic_snapshot.dart';
import 'package:social_monitor_settings/src/domain/entities/workspace_settings.dart';
import 'package:social_monitor_settings/src/domain/value_objects/digest_frequency.dart';
import 'package:social_monitor_settings/src/domain/value_objects/telemetry_consent_state.dart';
import 'package:social_monitor_settings/src/infrastructure/api/workspace_settings_api_dto.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

const settingsWorkspaceScope = WorkspaceScope(
  tenantId: 'tenant-demo',
  workspaceId: 'workspace-demo',
);

DiagnosticSnapshotApiDto diagnosticSnapshotApiDto({
  String traceId = 'frontend-demo-session',
  String routeId = 'settings',
  String releaseVersion = 'frontend-mvp',
  String featureSnapshot = 'auth,topics,sources,feed,summaries,settings',
}) {
  return DiagnosticSnapshotApiDto(
    traceId: traceId,
    routeId: routeId,
    releaseVersion: releaseVersion,
    featureSnapshot: featureSnapshot,
  );
}

WorkspaceSettingsApiDto workspaceSettingsApiDto({
  String workspaceRole = 'Owner',
  String digestFrequency = 'weekly',
  String telemetryConsent = 'not_configured',
  DiagnosticSnapshotApiDto? diagnostics,
}) {
  return WorkspaceSettingsApiDto(
    workspaceRole: workspaceRole,
    digestFrequency: digestFrequency,
    telemetryConsent: telemetryConsent,
    diagnostics: diagnostics ?? diagnosticSnapshotApiDto(),
  );
}

WorkspaceSettings workspaceSettings({
  String workspaceRole = 'Owner',
  DigestFrequency digestFrequency = DigestFrequency.weekly,
  TelemetryConsentState telemetryConsent = TelemetryConsentState.notConfigured,
  DiagnosticSnapshot diagnostics = const DiagnosticSnapshot(
    traceId: 'frontend-demo-session',
    routeId: 'settings',
    releaseVersion: 'frontend-mvp',
    featureSnapshot: 'auth,topics,sources,feed,summaries,settings',
    safeCopyText:
        'trace=frontend-demo-session route=settings release=frontend-mvp features=auth,topics,sources,feed,summaries,settings',
  ),
}) {
  return WorkspaceSettings(
    workspaceRole: workspaceRole,
    digestFrequency: digestFrequency,
    telemetryConsent: telemetryConsent,
    diagnostics: diagnostics,
  );
}
