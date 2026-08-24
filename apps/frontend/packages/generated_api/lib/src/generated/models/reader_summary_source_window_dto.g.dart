// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_source_window_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummarySourceWindowDto _$ReaderSummarySourceWindowDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummarySourceWindowDto(
  endedAt: DateTime.parse(json['endedAt'] as String),
  selectedFeedItemIds: (json['selectedFeedItemIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  startedAt: DateTime.parse(json['startedAt'] as String),
  storyClusterIds: (json['storyClusterIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  windowId: json['windowId'] as String,
  ingestionCutoff: json['ingestionCutoff'] == null
      ? null
      : DateTime.parse(json['ingestionCutoff'] as String),
);

Map<String, dynamic> _$ReaderSummarySourceWindowDtoToJson(
  ReaderSummarySourceWindowDto instance,
) => <String, dynamic>{
  'endedAt': instance.endedAt.toIso8601String(),
  'ingestionCutoff': instance.ingestionCutoff?.toIso8601String(),
  'selectedFeedItemIds': instance.selectedFeedItemIds,
  'startedAt': instance.startedAt.toIso8601String(),
  'storyClusterIds': instance.storyClusterIds,
  'windowId': instance.windowId,
};
