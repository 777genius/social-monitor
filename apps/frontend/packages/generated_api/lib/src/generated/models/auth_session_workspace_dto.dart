// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'auth_session_workspace_dto_workspace_role_workspace_role.dart';

part 'auth_session_workspace_dto.g.dart';

@JsonSerializable()
class AuthSessionWorkspaceDto {
  const AuthSessionWorkspaceDto({
    required this.statusLabel,
    required this.tenantId,
    required this.tenantName,
    required this.workspaceId,
    required this.workspaceName,
    required this.workspaceRole,
  });

  factory AuthSessionWorkspaceDto.fromJson(Map<String, Object?> json) =>
      _$AuthSessionWorkspaceDtoFromJson(json);

  final String statusLabel;
  final String tenantId;
  final String tenantName;
  final String workspaceId;
  final String workspaceName;
  final AuthSessionWorkspaceDtoWorkspaceRoleWorkspaceRole workspaceRole;

  Map<String, Object?> toJson() => _$AuthSessionWorkspaceDtoToJson(this);
}
