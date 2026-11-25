import '../value_objects/digest_frequency.dart';
import '../value_objects/telemetry_consent_state.dart';
import 'diagnostic_snapshot.dart';

final class WorkspaceSettings {
  const WorkspaceSettings({
    required this.workspaceRole,
    required this.digestFrequency,
    required this.telemetryConsent,
    required this.diagnostics,
  });

  final String workspaceRole;
  final DigestFrequency digestFrequency;
  final TelemetryConsentState telemetryConsent;
  final DiagnosticSnapshot diagnostics;
}
