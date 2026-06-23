// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'list_briefings_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ListBriefingsResponseDto _$ListBriefingsResponseDtoFromJson(
  Map<String, dynamic> json,
) => ListBriefingsResponseDto(
  items: (json['items'] as List<dynamic>)
      .map(
        (e) => BriefingArtifactResponseDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  nextCursor: json['nextCursor'] as String?,
);

Map<String, dynamic> _$ListBriefingsResponseDtoToJson(
  ListBriefingsResponseDto instance,
) => <String, dynamic>{
  'items': instance.items,
  'nextCursor': instance.nextCursor,
};
