// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'feed_source_breakdown_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FeedSourceBreakdownDto _$FeedSourceBreakdownDtoFromJson(
  Map<String, dynamic> json,
) => FeedSourceBreakdownDto(
  providerCount: json['providerCount'] as num,
  sourceCount: json['sourceCount'] as num,
  sources: (json['sources'] as List<dynamic>)
      .map(
        (e) => FeedSourceBreakdownEntryDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  totalItems: json['totalItems'] as num,
);

Map<String, dynamic> _$FeedSourceBreakdownDtoToJson(
  FeedSourceBreakdownDto instance,
) => <String, dynamic>{
  'providerCount': instance.providerCount,
  'sourceCount': instance.sourceCount,
  'sources': instance.sources,
  'totalItems': instance.totalItems,
};
