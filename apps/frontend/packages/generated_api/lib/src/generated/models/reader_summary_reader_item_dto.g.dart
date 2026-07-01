// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_reader_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryReaderItemDto _$ReaderSummaryReaderItemDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryReaderItemDto(
  citationIds: (json['citationIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  confidence: ReaderSummaryReaderItemConfidenceDto.fromJson(
    json['confidence'] as Map<String, dynamic>,
  ),
  confirmedProviderKeys: (json['confirmedProviderKeys'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  matchedInterestIds: (json['matchedInterestIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  matchedRules: (json['matchedRules'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  primaryActionKind:
      ReaderSummaryReaderItemDtoPrimaryActionKindPrimaryActionKind.fromJson(
        json['primaryActionKind'] as String,
      ),
  providerKey: json['providerKey'] as String,
  providerMetrics: (json['providerMetrics'] as List<dynamic>)
      .map(
        (e) =>
            ReaderSummaryProviderMetricDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  providerName: json['providerName'] as String,
  reason: json['reason'] as String,
  signalScore: json['signalScore'] as num,
  title: json['title'] as String,
  whyImportant: (json['whyImportant'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  whyNow: json['whyNow'] as String,
  canonicalUrl: json['canonicalUrl'] as String?,
  previewMedia: json['previewMedia'] == null
      ? null
      : ReaderSummaryPreviewMediaDto.fromJson(
          json['previewMedia'] as Map<String, dynamic>,
        ),
);

Map<String, dynamic> _$ReaderSummaryReaderItemDtoToJson(
  ReaderSummaryReaderItemDto instance,
) => <String, dynamic>{
  'canonicalUrl': instance.canonicalUrl,
  'citationIds': instance.citationIds,
  'confidence': instance.confidence,
  'confirmedProviderKeys': instance.confirmedProviderKeys,
  'matchedInterestIds': instance.matchedInterestIds,
  'matchedRules': instance.matchedRules,
  'previewMedia': instance.previewMedia,
  'primaryActionKind': instance.primaryActionKind,
  'providerKey': instance.providerKey,
  'providerMetrics': instance.providerMetrics,
  'providerName': instance.providerName,
  'reason': instance.reason,
  'signalScore': instance.signalScore,
  'title': instance.title,
  'whyImportant': instance.whyImportant,
  'whyNow': instance.whyNow,
};
