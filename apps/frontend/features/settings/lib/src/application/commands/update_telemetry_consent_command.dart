import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/telemetry_consent_state.dart';

final class UpdateTelemetryConsentCommand {
  const UpdateTelemetryConsentCommand({
    required this.scope,
    required this.consent,
  });

  final WorkspaceScope scope;
  final TelemetryConsentState consent;
}
