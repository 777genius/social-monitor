// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'workspace_settings_diagnostics_dto.g.dart';

@JsonSerializable()
class WorkspaceSettingsDiagnosticsDto {
  const WorkspaceSettingsDiagnosticsDto({
    required this.featureSnapshot,
    required this.releaseVersion,
    required this.routeId,
    required this.traceId,
  });

  factory WorkspaceSettingsDiagnosticsDto.fromJson(Map<String, Object?> json) =>
      _$WorkspaceSettingsDiagnosticsDtoFromJson(json);

  final String featureSnapshot;
  final String releaseVersion;
  final String routeId;
  final String traceId;

  Map<String, Object?> toJson() =>
      _$WorkspaceSettingsDiagnosticsDtoToJson(this);
}
