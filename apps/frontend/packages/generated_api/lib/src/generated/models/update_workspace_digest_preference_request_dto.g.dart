// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_workspace_digest_preference_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateWorkspaceDigestPreferenceRequestDto
_$UpdateWorkspaceDigestPreferenceRequestDtoFromJson(
  Map<String, dynamic> json,
) => UpdateWorkspaceDigestPreferenceRequestDto(
  frequency:
      UpdateWorkspaceDigestPreferenceRequestDtoFrequencyFrequency.fromJson(
        json['frequency'] as String,
      ),
);

Map<String, dynamic> _$UpdateWorkspaceDigestPreferenceRequestDtoToJson(
  UpdateWorkspaceDigestPreferenceRequestDto instance,
) => <String, dynamic>{'frequency': instance.frequency};
