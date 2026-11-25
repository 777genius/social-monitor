// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'summary_source_window_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SummarySourceWindowDto _$SummarySourceWindowDtoFromJson(
  Map<String, dynamic> json,
) => SummarySourceWindowDto(
  endedAt: DateTime.parse(json['endedAt'] as String),
  selectedFeedItemIds: (json['selectedFeedItemIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  startedAt: DateTime.parse(json['startedAt'] as String),
  windowId: json['windowId'] as String,
);

Map<String, dynamic> _$SummarySourceWindowDtoToJson(
  SummarySourceWindowDto instance,
) => <String, dynamic>{
  'endedAt': instance.endedAt.toIso8601String(),
  'selectedFeedItemIds': instance.selectedFeedItemIds,
  'startedAt': instance.startedAt.toIso8601String(),
  'windowId': instance.windowId,
};
