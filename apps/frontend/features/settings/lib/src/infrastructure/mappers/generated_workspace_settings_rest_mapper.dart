import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;

import '../../domain/value_objects/digest_frequency.dart';
import '../../domain/value_objects/telemetry_consent_state.dart';
import '../api/workspace_settings_api_dto.dart';
import '../api_clients/in_memory_workspace_settings_api_client.dart';

final class GeneratedWorkspaceSettingsRestMapper {
  const GeneratedWorkspaceSettingsRestMapper();

  WorkspaceSettingsApiDto workspaceSettings(
    generated.WorkspaceSettingsResponseDto dto,
  ) {
    return WorkspaceSettingsApiDto(
      workspaceRole: dto.workspaceRole,
      digestFrequency: dto.digestFrequency.toJson(),
      telemetryConsent: dto.telemetryConsent.toJson(),
      diagnostics: DiagnosticSnapshotApiDto(
        traceId: dto.diagnostics.traceId,
        routeId: dto.diagnostics.routeId,
        releaseVersion: dto.diagnostics.releaseVersion,
        featureSnapshot: dto.diagnostics.featureSnapshot,
      ),
    );
  }

  generated.UpdateWorkspaceDigestPreferenceRequestDto? updateDigestPreference(
    UpdateDigestPreferenceApiRequest request,
  ) {
    final frequency = switch (request.frequency) {
      DigestFrequency.off =>
        generated
            .UpdateWorkspaceDigestPreferenceRequestDtoFrequencyFrequency
            .off,
      DigestFrequency.daily =>
        generated
            .UpdateWorkspaceDigestPreferenceRequestDtoFrequencyFrequency
            .daily,
      DigestFrequency.weekly =>
        generated
            .UpdateWorkspaceDigestPreferenceRequestDtoFrequencyFrequency
            .weekly,
      DigestFrequency.unknown => null,
    };

    return frequency == null
        ? null
        : generated.UpdateWorkspaceDigestPreferenceRequestDto(
            frequency: frequency,
          );
  }

  generated.UpdateWorkspaceTelemetryConsentRequestDto? updateTelemetryConsent(
    UpdateTelemetryConsentApiRequest request,
  ) {
    final consent = switch (request.consent) {
      TelemetryConsentState.enabled =>
        generated
            .UpdateWorkspaceTelemetryConsentRequestDtoConsentConsent
            .enabled,
      TelemetryConsentState.disabled =>
        generated
            .UpdateWorkspaceTelemetryConsentRequestDtoConsentConsent
            .disabled,
      TelemetryConsentState.notConfigured =>
        generated
            .UpdateWorkspaceTelemetryConsentRequestDtoConsentConsent
            .notConfigured,
      TelemetryConsentState.unknown => null,
    };

    return consent == null
        ? null
        : generated.UpdateWorkspaceTelemetryConsentRequestDto(consent: consent);
  }
}
