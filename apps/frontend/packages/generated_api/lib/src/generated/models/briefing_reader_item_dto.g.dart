// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'briefing_reader_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BriefingReaderItemDto _$BriefingReaderItemDtoFromJson(
  Map<String, dynamic> json,
) => BriefingReaderItemDto(
  citationIds: (json['citationIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  matchedRules: (json['matchedRules'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  matchedTopicIds: (json['matchedTopicIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  providerKey: json['providerKey'] as String,
  providerMetrics: (json['providerMetrics'] as List<dynamic>)
      .map((e) => BriefingProviderMetricDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  reason: json['reason'] as String,
  signalScore: json['signalScore'] as num,
  title: json['title'] as String,
  whyImportant: (json['whyImportant'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  whyNow: json['whyNow'] as String,
  canonicalUrl: json['canonicalUrl'] as String?,
);

Map<String, dynamic> _$BriefingReaderItemDtoToJson(
  BriefingReaderItemDto instance,
) => <String, dynamic>{
  'canonicalUrl': instance.canonicalUrl,
  'citationIds': instance.citationIds,
  'matchedRules': instance.matchedRules,
  'matchedTopicIds': instance.matchedTopicIds,
  'providerKey': instance.providerKey,
  'providerMetrics': instance.providerMetrics,
  'reason': instance.reason,
  'signalScore': instance.signalScore,
  'title': instance.title,
  'whyImportant': instance.whyImportant,
  'whyNow': instance.whyNow,
};
