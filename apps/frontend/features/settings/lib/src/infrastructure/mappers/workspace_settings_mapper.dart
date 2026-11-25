import '../../domain/entities/diagnostic_snapshot.dart';
import '../../domain/entities/workspace_settings.dart';
import '../../domain/value_objects/digest_frequency.dart';
import '../../domain/value_objects/telemetry_consent_state.dart';
import '../api/workspace_settings_api_dto.dart';

final class WorkspaceSettingsMapper {
  const WorkspaceSettingsMapper();

  WorkspaceSettings toDomain(WorkspaceSettingsApiDto dto) {
    final diagnostics = _diagnosticsToDomain(dto.diagnostics);
    return WorkspaceSettings(
      workspaceRole: _nonEmpty(dto.workspaceRole, fallback: 'Unknown'),
      digestFrequency: _digestFromApi(dto.digestFrequency),
      telemetryConsent: _consentFromApi(dto.telemetryConsent),
      diagnostics: diagnostics,
    );
  }

  DiagnosticSnapshot _diagnosticsToDomain(DiagnosticSnapshotApiDto dto) {
    final traceId = _safeText(dto.traceId, fallback: 'trace-unavailable');
    final routeId = _safeText(dto.routeId, fallback: 'route-unavailable');
    final releaseVersion = _safeText(
      dto.releaseVersion,
      fallback: 'release-unavailable',
    );
    final featureSnapshot = _safeText(
      dto.featureSnapshot,
      fallback: 'features-unavailable',
    );
    return DiagnosticSnapshot(
      traceId: traceId,
      routeId: routeId,
      releaseVersion: releaseVersion,
      featureSnapshot: featureSnapshot,
      safeCopyText:
          'trace=$traceId route=$routeId release=$releaseVersion features=$featureSnapshot',
    );
  }

  DigestFrequency _digestFromApi(String value) {
    return switch (value.trim().toLowerCase()) {
      'off' => DigestFrequency.off,
      'daily' => DigestFrequency.daily,
      'weekly' => DigestFrequency.weekly,
      _ => DigestFrequency.unknown,
    };
  }

  TelemetryConsentState _consentFromApi(String value) {
    return switch (value.trim().toLowerCase()) {
      'enabled' => TelemetryConsentState.enabled,
      'disabled' => TelemetryConsentState.disabled,
      'not_configured' => TelemetryConsentState.notConfigured,
      _ => TelemetryConsentState.unknown,
    };
  }

  String _safeText(String raw, {required String fallback}) {
    final withoutSecrets = raw
        .replaceAll(RegExp(r'Bearer\s+[A-Za-z0-9._~+/=-]+'), '[redacted]')
        .replaceAll(RegExp(r'sk-[A-Za-z0-9_-]+'), '[redacted]')
        .replaceAll(RegExp(r'client_secret\s*[:=]\s*\S+'), '[redacted]');
    final singleLine = withoutSecrets.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (singleLine.isEmpty) {
      return fallback;
    }
    return singleLine.length <= 180
        ? singleLine
        : '${singleLine.substring(0, 177)}...';
  }

  String _nonEmpty(String? value, {required String fallback}) {
    final trimmed = value?.trim();
    if (trimmed == null || trimmed.isEmpty) {
      return fallback;
    }
    return trimmed;
  }
}
