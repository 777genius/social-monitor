// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'request_briefing_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RequestBriefingResponseDto _$RequestBriefingResponseDtoFromJson(
  Map<String, dynamic> json,
) => RequestBriefingResponseDto(
  briefingJobId: json['briefingJobId'] as String,
  created: json['created'] as bool,
  status: RequestBriefingResponseDtoStatusStatus.fromJson(
    json['status'] as String,
  ),
);

Map<String, dynamic> _$RequestBriefingResponseDtoToJson(
  RequestBriefingResponseDto instance,
) => <String, dynamic>{
  'briefingJobId': instance.briefingJobId,
  'created': instance.created,
  'status': instance.status,
};
