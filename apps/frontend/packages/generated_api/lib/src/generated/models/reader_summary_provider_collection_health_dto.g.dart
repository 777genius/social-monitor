// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_provider_collection_health_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryProviderCollectionHealthDto
_$ReaderSummaryProviderCollectionHealthDtoFromJson(Map<String, dynamic> json) =>
    ReaderSummaryProviderCollectionHealthDto(
      acceptedItemCount: json['acceptedItemCount'] as num,
      collectedItemCount: json['collectedItemCount'] as num,
      failureKinds: (json['failureKinds'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      insertedItemCount: json['insertedItemCount'] as num,
      outsideWindowItemCount: json['outsideWindowItemCount'] as num,
      pageCount: json['pageCount'] as num,
      paginationDuplicateItemCount: json['paginationDuplicateItemCount'] as num,
      paginationStopReasons: (json['paginationStopReasons'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      rateLimitEventCount: json['rateLimitEventCount'] as num,
      scanCount: json['scanCount'] as num,
      state: ReaderSummaryProviderCollectionHealthDtoStateState.fromJson(
        json['state'] as String,
      ),
      storageDuplicateItemCount: json['storageDuplicateItemCount'] as num,
      newestAcceptedPublishedAt: json['newestAcceptedPublishedAt'] == null
          ? null
          : DateTime.parse(json['newestAcceptedPublishedAt'] as String),
      oldestAcceptedPublishedAt: json['oldestAcceptedPublishedAt'] == null
          ? null
          : DateTime.parse(json['oldestAcceptedPublishedAt'] as String),
      targetItemCount: json['targetItemCount'] as num?,
    );

Map<String, dynamic> _$ReaderSummaryProviderCollectionHealthDtoToJson(
  ReaderSummaryProviderCollectionHealthDto instance,
) => <String, dynamic>{
  'acceptedItemCount': instance.acceptedItemCount,
  'collectedItemCount': instance.collectedItemCount,
  'failureKinds': instance.failureKinds,
  'insertedItemCount': instance.insertedItemCount,
  'newestAcceptedPublishedAt': instance.newestAcceptedPublishedAt
      ?.toIso8601String(),
  'oldestAcceptedPublishedAt': instance.oldestAcceptedPublishedAt
      ?.toIso8601String(),
  'outsideWindowItemCount': instance.outsideWindowItemCount,
  'pageCount': instance.pageCount,
  'paginationDuplicateItemCount': instance.paginationDuplicateItemCount,
  'paginationStopReasons': instance.paginationStopReasons,
  'rateLimitEventCount': instance.rateLimitEventCount,
  'scanCount': instance.scanCount,
  'state': instance.state,
  'storageDuplicateItemCount': instance.storageDuplicateItemCount,
  'targetItemCount': instance.targetItemCount,
};
