// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'workspace_settings_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

WorkspaceSettingsResponseDto _$WorkspaceSettingsResponseDtoFromJson(
  Map<String, dynamic> json,
) => WorkspaceSettingsResponseDto(
  diagnostics: WorkspaceSettingsDiagnosticsDto.fromJson(
    json['diagnostics'] as Map<String, dynamic>,
  ),
  digestFrequency:
      WorkspaceSettingsResponseDtoDigestFrequencyDigestFrequency.fromJson(
        json['digestFrequency'] as String,
      ),
  telemetryConsent:
      WorkspaceSettingsResponseDtoTelemetryConsentTelemetryConsent.fromJson(
        json['telemetryConsent'] as String,
      ),
  workspaceRole: json['workspaceRole'] as String,
);

Map<String, dynamic> _$WorkspaceSettingsResponseDtoToJson(
  WorkspaceSettingsResponseDto instance,
) => <String, dynamic>{
  'diagnostics': instance.diagnostics,
  'digestFrequency': instance.digestFrequency,
  'telemetryConsent': instance.telemetryConsent,
  'workspaceRole': instance.workspaceRole,
};
