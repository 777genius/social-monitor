// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'auth_session_workspace_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AuthSessionWorkspaceDto _$AuthSessionWorkspaceDtoFromJson(
  Map<String, dynamic> json,
) => AuthSessionWorkspaceDto(
  statusLabel: json['statusLabel'] as String,
  tenantId: json['tenantId'] as String,
  tenantName: json['tenantName'] as String,
  workspaceId: json['workspaceId'] as String,
  workspaceName: json['workspaceName'] as String,
  workspaceRole: AuthSessionWorkspaceDtoWorkspaceRoleWorkspaceRole.fromJson(
    json['workspaceRole'] as String,
  ),
);

Map<String, dynamic> _$AuthSessionWorkspaceDtoToJson(
  AuthSessionWorkspaceDto instance,
) => <String, dynamic>{
  'statusLabel': instance.statusLabel,
  'tenantId': instance.tenantId,
  'tenantName': instance.tenantName,
  'workspaceId': instance.workspaceId,
  'workspaceName': instance.workspaceName,
  'workspaceRole': instance.workspaceRole,
};
