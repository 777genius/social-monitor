// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_reader_quality_state_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryReaderQualityStateDto _$ReaderSummaryReaderQualityStateDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryReaderQualityStateDto(
  flags: (json['flags'] as List<dynamic>)
      .map(
        (e) =>
            ReaderSummaryReaderQualityStateDtoFlagsFlags.fromJson(e as String),
      )
      .toList(),
  isSingleSource: json['isSingleSource'] as bool,
  status: ReaderSummaryReaderQualityStateDtoStatusStatus.fromJson(
    json['status'] as String,
  ),
  warnings: (json['warnings'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
);

Map<String, dynamic> _$ReaderSummaryReaderQualityStateDtoToJson(
  ReaderSummaryReaderQualityStateDto instance,
) => <String, dynamic>{
  'flags': instance.flags,
  'isSingleSource': instance.isSingleSource,
  'status': instance.status,
  'warnings': instance.warnings,
};
