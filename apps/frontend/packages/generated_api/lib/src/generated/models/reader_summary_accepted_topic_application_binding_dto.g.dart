// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_accepted_topic_application_binding_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryAcceptedTopicApplicationBindingDto
_$ReaderSummaryAcceptedTopicApplicationBindingDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryAcceptedTopicApplicationBindingDto(
  changed: json['changed'] as bool,
  changedConfigPaths: (json['changedConfigPaths'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  interestId: json['interestId'] as String,
  providerKey: json['providerKey'] as String,
  sourceBindingId: json['sourceBindingId'] as String,
);

Map<String, dynamic> _$ReaderSummaryAcceptedTopicApplicationBindingDtoToJson(
  ReaderSummaryAcceptedTopicApplicationBindingDto instance,
) => <String, dynamic>{
  'changed': instance.changed,
  'changedConfigPaths': instance.changedConfigPaths,
  'interestId': instance.interestId,
  'providerKey': instance.providerKey,
  'sourceBindingId': instance.sourceBindingId,
};
