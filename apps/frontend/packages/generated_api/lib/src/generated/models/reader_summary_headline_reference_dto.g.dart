// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_headline_reference_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryHeadlineReferenceDto _$ReaderSummaryHeadlineReferenceDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryHeadlineReferenceDto(
  end: json['end'] as num,
  field: ReaderSummaryHeadlineReferenceDtoFieldField.fromJson(
    json['field'] as String,
  ),
  quote: json['quote'] as String,
  start: json['start'] as num,
);

Map<String, dynamic> _$ReaderSummaryHeadlineReferenceDtoToJson(
  ReaderSummaryHeadlineReferenceDto instance,
) => <String, dynamic>{
  'end': instance.end,
  'field': instance.field,
  'quote': instance.quote,
  'start': instance.start,
};
