// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'briefing_source_window_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BriefingSourceWindowDto _$BriefingSourceWindowDtoFromJson(
  Map<String, dynamic> json,
) => BriefingSourceWindowDto(
  endedAt: DateTime.parse(json['endedAt'] as String),
  selectedFeedItemIds: (json['selectedFeedItemIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  startedAt: DateTime.parse(json['startedAt'] as String),
  storyClusterIds: (json['storyClusterIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  windowId: json['windowId'] as String,
);

Map<String, dynamic> _$BriefingSourceWindowDtoToJson(
  BriefingSourceWindowDto instance,
) => <String, dynamic>{
  'endedAt': instance.endedAt.toIso8601String(),
  'selectedFeedItemIds': instance.selectedFeedItemIds,
  'startedAt': instance.startedAt.toIso8601String(),
  'storyClusterIds': instance.storyClusterIds,
  'windowId': instance.windowId,
};
