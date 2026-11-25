// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'workspace_settings_diagnostics_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

WorkspaceSettingsDiagnosticsDto _$WorkspaceSettingsDiagnosticsDtoFromJson(
  Map<String, dynamic> json,
) => WorkspaceSettingsDiagnosticsDto(
  featureSnapshot: json['featureSnapshot'] as String,
  releaseVersion: json['releaseVersion'] as String,
  routeId: json['routeId'] as String,
  traceId: json['traceId'] as String,
);

Map<String, dynamic> _$WorkspaceSettingsDiagnosticsDtoToJson(
  WorkspaceSettingsDiagnosticsDto instance,
) => <String, dynamic>{
  'featureSnapshot': instance.featureSnapshot,
  'releaseVersion': instance.releaseVersion,
  'routeId': instance.routeId,
  'traceId': instance.traceId,
};
