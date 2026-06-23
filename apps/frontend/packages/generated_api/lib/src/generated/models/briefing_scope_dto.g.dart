// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'briefing_scope_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BriefingScopeDto _$BriefingScopeDtoFromJson(Map<String, dynamic> json) =>
    BriefingScopeDto(
      type: BriefingScopeDtoTypeType.fromJson(json['type'] as String),
      topicId: json['topicId'] as String?,
    );

Map<String, dynamic> _$BriefingScopeDtoToJson(BriefingScopeDto instance) =>
    <String, dynamic>{'topicId': instance.topicId, 'type': instance.type};
