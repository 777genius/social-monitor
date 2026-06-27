// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'request_reader_summary_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RequestReaderSummaryResponseDto _$RequestReaderSummaryResponseDtoFromJson(
  Map<String, dynamic> json,
) => RequestReaderSummaryResponseDto(
  created: json['created'] as bool,
  readerSummaryJobId: json['readerSummaryJobId'] as String,
  status: RequestReaderSummaryResponseDtoStatusStatus.fromJson(
    json['status'] as String,
  ),
);

Map<String, dynamic> _$RequestReaderSummaryResponseDtoToJson(
  RequestReaderSummaryResponseDto instance,
) => <String, dynamic>{
  'created': instance.created,
  'readerSummaryJobId': instance.readerSummaryJobId,
  'status': instance.status,
};
