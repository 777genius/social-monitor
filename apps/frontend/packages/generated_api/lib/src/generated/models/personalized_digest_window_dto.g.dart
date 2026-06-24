// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'personalized_digest_window_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PersonalizedDigestWindowDto _$PersonalizedDigestWindowDtoFromJson(
  Map<String, dynamic> json,
) => PersonalizedDigestWindowDto(
  endedAt: DateTime.parse(json['endedAt'] as String),
  startedAt: DateTime.parse(json['startedAt'] as String),
);

Map<String, dynamic> _$PersonalizedDigestWindowDtoToJson(
  PersonalizedDigestWindowDto instance,
) => <String, dynamic>{
  'endedAt': instance.endedAt.toIso8601String(),
  'startedAt': instance.startedAt.toIso8601String(),
};
