// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'personalized_digest_window_dto.g.dart';

@JsonSerializable()
class PersonalizedDigestWindowDto {
  const PersonalizedDigestWindowDto({
    required this.endedAt,
    required this.startedAt,
  });

  factory PersonalizedDigestWindowDto.fromJson(Map<String, Object?> json) =>
      _$PersonalizedDigestWindowDtoFromJson(json);

  final DateTime endedAt;
  final DateTime startedAt;

  Map<String, Object?> toJson() => _$PersonalizedDigestWindowDtoToJson(this);
}
