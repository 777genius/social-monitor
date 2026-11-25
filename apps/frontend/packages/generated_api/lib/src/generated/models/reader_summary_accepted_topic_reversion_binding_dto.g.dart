// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_accepted_topic_reversion_binding_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryAcceptedTopicReversionBindingDto
_$ReaderSummaryAcceptedTopicReversionBindingDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryAcceptedTopicReversionBindingDto(
  interestId: json['interestId'] as String,
  providerKey: json['providerKey'] as String,
  restoredConfigPaths: (json['restoredConfigPaths'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  reverted: json['reverted'] as bool,
  sourceBindingId: json['sourceBindingId'] as String,
  reason: json['reason'] as String?,
);

Map<String, dynamic> _$ReaderSummaryAcceptedTopicReversionBindingDtoToJson(
  ReaderSummaryAcceptedTopicReversionBindingDto instance,
) => <String, dynamic>{
  'interestId': instance.interestId,
  'providerKey': instance.providerKey,
  'reason': instance.reason,
  'restoredConfigPaths': instance.restoredConfigPaths,
  'reverted': instance.reverted,
  'sourceBindingId': instance.sourceBindingId,
};
