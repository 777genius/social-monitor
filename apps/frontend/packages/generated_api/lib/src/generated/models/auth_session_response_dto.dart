// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'auth_session_response_dto_user_role_user_role.dart';
import 'auth_session_workspace_dto.dart';

part 'auth_session_response_dto.g.dart';

@JsonSerializable()
class AuthSessionResponseDto {
  const AuthSessionResponseDto({
    required this.selectedWorkspace,
    required this.userId,
    required this.userLabel,
    required this.userRole,
    required this.workspaces,
  });

  factory AuthSessionResponseDto.fromJson(Map<String, Object?> json) =>
      _$AuthSessionResponseDtoFromJson(json);

  final AuthSessionWorkspaceDto selectedWorkspace;
  final String userId;
  final String userLabel;
  final AuthSessionResponseDtoUserRoleUserRole userRole;
  final List<AuthSessionWorkspaceDto> workspaces;

  Map<String, Object?> toJson() => _$AuthSessionResponseDtoToJson(this);
}
