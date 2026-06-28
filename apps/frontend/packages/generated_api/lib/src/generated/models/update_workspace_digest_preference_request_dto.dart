// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'update_workspace_digest_preference_request_dto_frequency_frequency.dart';

part 'update_workspace_digest_preference_request_dto.g.dart';

@JsonSerializable()
class UpdateWorkspaceDigestPreferenceRequestDto {
  const UpdateWorkspaceDigestPreferenceRequestDto({required this.frequency});

  factory UpdateWorkspaceDigestPreferenceRequestDto.fromJson(
    Map<String, Object?> json,
  ) => _$UpdateWorkspaceDigestPreferenceRequestDtoFromJson(json);

  final UpdateWorkspaceDigestPreferenceRequestDtoFrequencyFrequency frequency;

  Map<String, Object?> toJson() =>
      _$UpdateWorkspaceDigestPreferenceRequestDtoToJson(this);
}
