// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_provider_coverage_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryProviderCoverageDto _$ReaderSummaryProviderCoverageDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryProviderCoverageDto(
  citationCount: json['citationCount'] as num,
  providerKey: json['providerKey'] as String,
  selectedFeedItemCount: json['selectedFeedItemCount'] as num,
  topReadCount: json['topReadCount'] as num,
  collectedFeedItemCount: json['collectedFeedItemCount'] as num?,
);

Map<String, dynamic> _$ReaderSummaryProviderCoverageDtoToJson(
  ReaderSummaryProviderCoverageDto instance,
) => <String, dynamic>{
  'citationCount': instance.citationCount,
  'collectedFeedItemCount': instance.collectedFeedItemCount,
  'providerKey': instance.providerKey,
  'selectedFeedItemCount': instance.selectedFeedItemCount,
  'topReadCount': instance.topReadCount,
};
