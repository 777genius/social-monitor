// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'request_briefing_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RequestBriefingRequestDto _$RequestBriefingRequestDtoFromJson(
  Map<String, dynamic> json,
) => RequestBriefingRequestDto(
  scope: BriefingScopeDto.fromJson(json['scope'] as Map<String, dynamic>),
  subscriptionId: json['subscriptionId'] as String?,
  userId: json['userId'] as String?,
);

Map<String, dynamic> _$RequestBriefingRequestDtoToJson(
  RequestBriefingRequestDto instance,
) => <String, dynamic>{
  'scope': instance.scope,
  'subscriptionId': instance.subscriptionId,
  'userId': instance.userId,
};
