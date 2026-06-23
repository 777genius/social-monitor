// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'regenerate_summary_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RegenerateSummaryResponseDto _$RegenerateSummaryResponseDtoFromJson(
  Map<String, dynamic> json,
) => RegenerateSummaryResponseDto(
  created: json['created'] as bool,
  status: RegenerateSummaryResponseDtoStatusStatus.fromJson(
    json['status'] as String,
  ),
  summaryJobId: json['summaryJobId'] as String,
);

Map<String, dynamic> _$RegenerateSummaryResponseDtoToJson(
  RegenerateSummaryResponseDto instance,
) => <String, dynamic>{
  'created': instance.created,
  'status': instance.status,
  'summaryJobId': instance.summaryJobId,
};
