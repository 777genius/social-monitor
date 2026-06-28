import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_settings/src/domain/value_objects/digest_frequency.dart';
import 'package:social_monitor_settings/src/domain/value_objects/telemetry_consent_state.dart';
import 'package:social_monitor_settings/src/infrastructure/api_clients/in_memory_workspace_settings_api_client.dart';
import 'package:social_monitor_settings/src/infrastructure/mappers/generated_workspace_settings_rest_mapper.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

void main() {
  const mapper = GeneratedWorkspaceSettingsRestMapper();
  const scope = WorkspaceScope(
    tenantId: 'tenant-1',
    workspaceId: 'workspace-1',
  );

  test('maps workspace settings response into feature API DTO', () {
    final dto = mapper.workspaceSettings(
      const generated.WorkspaceSettingsResponseDto(
        workspaceRole: 'admin',
        digestFrequency: generated
            .WorkspaceSettingsResponseDtoDigestFrequencyDigestFrequency
            .daily,
        telemetryConsent: generated
            .WorkspaceSettingsResponseDtoTelemetryConsentTelemetryConsent
            .enabled,
        diagnostics: generated.WorkspaceSettingsDiagnosticsDto(
          traceId: 'trace-1',
          routeId: 'settings',
          releaseVersion: 'frontend-mvp',
          featureSnapshot: 'settings',
        ),
      ),
    );

    expect(dto.workspaceRole, 'admin');
    expect(dto.digestFrequency, 'daily');
    expect(dto.telemetryConsent, 'enabled');
    expect(dto.diagnostics.traceId, 'trace-1');
  });

  test('maps supported digest and telemetry mutation bodies', () {
    final digest = mapper.updateDigestPreference(
      const UpdateDigestPreferenceApiRequest(
        scope: scope,
        frequency: DigestFrequency.off,
      ),
    );
    final telemetry = mapper.updateTelemetryConsent(
      const UpdateTelemetryConsentApiRequest(
        scope: scope,
        consent: TelemetryConsentState.disabled,
      ),
    );

    expect(
      digest?.frequency,
      generated.UpdateWorkspaceDigestPreferenceRequestDtoFrequencyFrequency.off,
    );
    expect(
      telemetry?.consent,
      generated
          .UpdateWorkspaceTelemetryConsentRequestDtoConsentConsent
          .disabled,
    );
  });

  test('does not create mutation bodies for unknown values', () {
    expect(
      mapper.updateDigestPreference(
        const UpdateDigestPreferenceApiRequest(
          scope: scope,
          frequency: DigestFrequency.unknown,
        ),
      ),
      isNull,
    );
    expect(
      mapper.updateTelemetryConsent(
        const UpdateTelemetryConsentApiRequest(
          scope: scope,
          consent: TelemetryConsentState.unknown,
        ),
      ),
      isNull,
    );
  });
}
