// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'briefing_reader_quality_state_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BriefingReaderQualityStateDto _$BriefingReaderQualityStateDtoFromJson(
  Map<String, dynamic> json,
) => BriefingReaderQualityStateDto(
  flags: (json['flags'] as List<dynamic>)
      .map((e) => BriefingReaderQualityStateDtoFlagsFlags.fromJson(e as String))
      .toList(),
  isSingleSource: json['isSingleSource'] as bool,
  status: BriefingReaderQualityStateDtoStatusStatus.fromJson(
    json['status'] as String,
  ),
  warnings: (json['warnings'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
);

Map<String, dynamic> _$BriefingReaderQualityStateDtoToJson(
  BriefingReaderQualityStateDto instance,
) => <String, dynamic>{
  'flags': instance.flags,
  'isSingleSource': instance.isSingleSource,
  'status': instance.status,
  'warnings': instance.warnings,
};
