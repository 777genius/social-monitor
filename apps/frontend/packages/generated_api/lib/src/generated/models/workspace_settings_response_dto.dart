// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'workspace_settings_diagnostics_dto.dart';
import 'workspace_settings_response_dto_digest_frequency_digest_frequency.dart';
import 'workspace_settings_response_dto_telemetry_consent_telemetry_consent.dart';

part 'workspace_settings_response_dto.g.dart';

@JsonSerializable()
class WorkspaceSettingsResponseDto {
  const WorkspaceSettingsResponseDto({
    required this.diagnostics,
    required this.digestFrequency,
    required this.telemetryConsent,
    required this.workspaceRole,
  });

  factory WorkspaceSettingsResponseDto.fromJson(Map<String, Object?> json) =>
      _$WorkspaceSettingsResponseDtoFromJson(json);

  final WorkspaceSettingsDiagnosticsDto diagnostics;
  final WorkspaceSettingsResponseDtoDigestFrequencyDigestFrequency
  digestFrequency;
  final WorkspaceSettingsResponseDtoTelemetryConsentTelemetryConsent
  telemetryConsent;
  final String workspaceRole;

  Map<String, Object?> toJson() => _$WorkspaceSettingsResponseDtoToJson(this);
}
