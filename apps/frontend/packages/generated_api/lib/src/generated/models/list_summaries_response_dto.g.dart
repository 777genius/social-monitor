// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'list_summaries_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ListSummariesResponseDto _$ListSummariesResponseDtoFromJson(
  Map<String, dynamic> json,
) => ListSummariesResponseDto(
  items: (json['items'] as List<dynamic>)
      .map(
        (e) => SummaryArtifactResponseDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  nextCursor: json['nextCursor'] as String?,
);

Map<String, dynamic> _$ListSummariesResponseDtoToJson(
  ListSummariesResponseDto instance,
) => <String, dynamic>{
  'items': instance.items,
  'nextCursor': instance.nextCursor,
};
