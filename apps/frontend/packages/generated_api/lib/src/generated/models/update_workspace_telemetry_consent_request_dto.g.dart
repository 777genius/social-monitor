// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_workspace_telemetry_consent_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateWorkspaceTelemetryConsentRequestDto
_$UpdateWorkspaceTelemetryConsentRequestDtoFromJson(
  Map<String, dynamic> json,
) => UpdateWorkspaceTelemetryConsentRequestDto(
  consent: UpdateWorkspaceTelemetryConsentRequestDtoConsentConsent.fromJson(
    json['consent'] as String,
  ),
);

Map<String, dynamic> _$UpdateWorkspaceTelemetryConsentRequestDtoToJson(
  UpdateWorkspaceTelemetryConsentRequestDto instance,
) => <String, dynamic>{'consent': instance.consent};
