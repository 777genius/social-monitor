// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_interest_highlight_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryInterestHighlightDto _$ReaderSummaryInterestHighlightDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryInterestHighlightDto(
  citationIds: (json['citationIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  interestId: json['interestId'] as String,
  summary: json['summary'] as String,
  title: json['title'] as String,
);

Map<String, dynamic> _$ReaderSummaryInterestHighlightDtoToJson(
  ReaderSummaryInterestHighlightDto instance,
) => <String, dynamic>{
  'citationIds': instance.citationIds,
  'interestId': instance.interestId,
  'summary': instance.summary,
  'title': instance.title,
};
