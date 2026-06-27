// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_scope_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryScopeDto _$ReaderSummaryScopeDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryScopeDto(
  type: ReaderSummaryScopeDtoTypeType.fromJson(json['type'] as String),
  topicId: json['topicId'] as String?,
);

Map<String, dynamic> _$ReaderSummaryScopeDtoToJson(
  ReaderSummaryScopeDto instance,
) => <String, dynamic>{'topicId': instance.topicId, 'type': instance.type};
