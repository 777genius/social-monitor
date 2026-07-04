// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'list_reader_summary_periods_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ListReaderSummaryPeriodsResponseDto
_$ListReaderSummaryPeriodsResponseDtoFromJson(Map<String, dynamic> json) =>
    ListReaderSummaryPeriodsResponseDto(
      items: (json['items'] as List<dynamic>)
          .map(
            (e) => ReaderSummaryPeriodSummaryDto.fromJson(
              e as Map<String, dynamic>,
            ),
          )
          .toList(),
      nextCursor: json['nextCursor'] as String?,
    );

Map<String, dynamic> _$ListReaderSummaryPeriodsResponseDtoToJson(
  ListReaderSummaryPeriodsResponseDto instance,
) => <String, dynamic>{
  'items': instance.items,
  'nextCursor': instance.nextCursor,
};
