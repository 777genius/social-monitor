// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'list_reader_summaries_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ListReaderSummariesResponseDto _$ListReaderSummariesResponseDtoFromJson(
  Map<String, dynamic> json,
) => ListReaderSummariesResponseDto(
  items: (json['items'] as List<dynamic>)
      .map(
        (e) => ReaderSummaryArtifactResponseDto.fromJson(
          e as Map<String, dynamic>,
        ),
      )
      .toList(),
  nextCursor: json['nextCursor'] as String?,
);

Map<String, dynamic> _$ListReaderSummariesResponseDtoToJson(
  ListReaderSummariesResponseDto instance,
) => <String, dynamic>{
  'items': instance.items,
  'nextCursor': instance.nextCursor,
};
