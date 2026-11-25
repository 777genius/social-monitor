// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_scope_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryScopeDto _$ReaderSummaryScopeDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryScopeDto(
  type: ReaderSummaryScopeDtoTypeType.fromJson(json['type'] as String),
  interestId: json['interestId'] as String?,
);

Map<String, dynamic> _$ReaderSummaryScopeDtoToJson(
  ReaderSummaryScopeDto instance,
) => <String, dynamic>{
  'interestId': instance.interestId,
  'type': instance.type,
};
