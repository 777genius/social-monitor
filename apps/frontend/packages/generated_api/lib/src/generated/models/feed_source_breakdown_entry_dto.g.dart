// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'feed_source_breakdown_entry_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FeedSourceBreakdownEntryDto _$FeedSourceBreakdownEntryDtoFromJson(
  Map<String, dynamic> json,
) => FeedSourceBreakdownEntryDto(
  contentType: json['contentType'] as String,
  itemCount: json['itemCount'] as num,
  providerKey: json['providerKey'] as String,
  sampleItemIds: (json['sampleItemIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  sourceBindingIds: (json['sourceBindingIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  sourceKey: json['sourceKey'] as String,
  latestObservedAt: json['latestObservedAt'] == null
      ? null
      : DateTime.parse(json['latestObservedAt'] as String),
  latestPublishedAt: json['latestPublishedAt'] == null
      ? null
      : DateTime.parse(json['latestPublishedAt'] as String),
  maxSignalBand: json['maxSignalBand'] == null
      ? null
      : FeedSourceBreakdownEntryDtoMaxSignalBandMaxSignalBand.fromJson(
          json['maxSignalBand'] as String,
        ),
  maxSignalScore: json['maxSignalScore'] as num?,
);

Map<String, dynamic> _$FeedSourceBreakdownEntryDtoToJson(
  FeedSourceBreakdownEntryDto instance,
) => <String, dynamic>{
  'contentType': instance.contentType,
  'itemCount': instance.itemCount,
  'latestObservedAt': instance.latestObservedAt?.toIso8601String(),
  'latestPublishedAt': instance.latestPublishedAt?.toIso8601String(),
  'maxSignalBand': instance.maxSignalBand,
  'maxSignalScore': instance.maxSignalScore,
  'providerKey': instance.providerKey,
  'sampleItemIds': instance.sampleItemIds,
  'sourceBindingIds': instance.sourceBindingIds,
  'sourceKey': instance.sourceKey,
};
