// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'update_workspace_telemetry_consent_request_dto_consent_consent.dart';

part 'update_workspace_telemetry_consent_request_dto.g.dart';

@JsonSerializable()
class UpdateWorkspaceTelemetryConsentRequestDto {
  const UpdateWorkspaceTelemetryConsentRequestDto({required this.consent});

  factory UpdateWorkspaceTelemetryConsentRequestDto.fromJson(
    Map<String, Object?> json,
  ) => _$UpdateWorkspaceTelemetryConsentRequestDtoFromJson(json);

  final UpdateWorkspaceTelemetryConsentRequestDtoConsentConsent consent;

  Map<String, Object?> toJson() =>
      _$UpdateWorkspaceTelemetryConsentRequestDtoToJson(this);
}
