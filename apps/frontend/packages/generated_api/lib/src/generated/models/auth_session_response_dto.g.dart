// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'auth_session_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AuthSessionResponseDto _$AuthSessionResponseDtoFromJson(
  Map<String, dynamic> json,
) => AuthSessionResponseDto(
  selectedWorkspace: AuthSessionWorkspaceDto.fromJson(
    json['selectedWorkspace'] as Map<String, dynamic>,
  ),
  userId: json['userId'] as String,
  userLabel: json['userLabel'] as String,
  workspaces: (json['workspaces'] as List<dynamic>)
      .map((e) => AuthSessionWorkspaceDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$AuthSessionResponseDtoToJson(
  AuthSessionResponseDto instance,
) => <String, dynamic>{
  'selectedWorkspace': instance.selectedWorkspace,
  'userId': instance.userId,
  'userLabel': instance.userLabel,
  'workspaces': instance.workspaces,
};
