// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'request_summary_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RequestSummaryResponseDto _$RequestSummaryResponseDtoFromJson(
  Map<String, dynamic> json,
) => RequestSummaryResponseDto(
  created: json['created'] as bool,
  status: RequestSummaryResponseDtoStatusStatus.fromJson(
    json['status'] as String,
  ),
  summaryJobId: json['summaryJobId'] as String,
);

Map<String, dynamic> _$RequestSummaryResponseDtoToJson(
  RequestSummaryResponseDto instance,
) => <String, dynamic>{
  'created': instance.created,
  'status': instance.status,
  'summaryJobId': instance.summaryJobId,
};
