// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_reader_interest_section_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryReaderInterestSectionDto
_$ReaderSummaryReaderInterestSectionDtoFromJson(Map<String, dynamic> json) =>
    ReaderSummaryReaderInterestSectionDto(
      citationIds: (json['citationIds'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      insight: json['insight'] as String,
      items: (json['items'] as List<dynamic>)
          .map(
            (e) =>
                ReaderSummaryReaderItemDto.fromJson(e as Map<String, dynamic>),
          )
          .toList(),
      title: json['title'] as String,
      interestId: json['interestId'] as String?,
    );

Map<String, dynamic> _$ReaderSummaryReaderInterestSectionDtoToJson(
  ReaderSummaryReaderInterestSectionDto instance,
) => <String, dynamic>{
  'citationIds': instance.citationIds,
  'insight': instance.insight,
  'interestId': instance.interestId,
  'items': instance.items,
  'title': instance.title,
};
