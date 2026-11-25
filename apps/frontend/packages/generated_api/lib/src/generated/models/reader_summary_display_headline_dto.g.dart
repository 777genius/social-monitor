// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_display_headline_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryDisplayHeadlineDto _$ReaderSummaryDisplayHeadlineDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryDisplayHeadlineDto(
  status: ReaderSummaryDisplayHeadlineDtoStatusStatus.fromJson(
    json['status'] as String,
  ),
  binding: json['binding'] == null
      ? null
      : ReaderSummaryHeadlineBindingDto.fromJson(
          json['binding'] as Map<String, dynamic>,
        ),
  confidence: json['confidence'] as num?,
  kind: json['kind'] == null
      ? null
      : ReaderSummaryDisplayHeadlineDtoKindKind.fromJson(
          json['kind'] as String,
        ),
  qualifications: (json['qualifications'] as List<dynamic>?)
      ?.map(
        (e) => ReaderSummaryHeadlineQualificationDto.fromJson(
          e as Map<String, dynamic>,
        ),
      )
      .toList(),
  reasonCode: json['reasonCode'] as String?,
  support: (json['support'] as List<dynamic>?)
      ?.map(
        (e) => ReaderSummaryHeadlineReferenceDto.fromJson(
          e as Map<String, dynamic>,
        ),
      )
      .toList(),
  text: json['text'] as String?,
  wholeInput: json['wholeInput'] == null
      ? null
      : ReaderSummaryHeadlineWholeInputDto.fromJson(
          json['wholeInput'] as Map<String, dynamic>,
        ),
);

Map<String, dynamic> _$ReaderSummaryDisplayHeadlineDtoToJson(
  ReaderSummaryDisplayHeadlineDto instance,
) => <String, dynamic>{
  'binding': instance.binding,
  'confidence': instance.confidence,
  'kind': instance.kind,
  'qualifications': instance.qualifications,
  'reasonCode': instance.reasonCode,
  'status': instance.status,
  'support': instance.support,
  'text': instance.text,
  'wholeInput': instance.wholeInput,
};
