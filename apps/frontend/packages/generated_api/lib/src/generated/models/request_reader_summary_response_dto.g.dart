// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'request_reader_summary_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RequestReaderSummaryResponseDto _$RequestReaderSummaryResponseDtoFromJson(
  Map<String, dynamic> json,
) => RequestReaderSummaryResponseDto(
  created: json['created'] as bool,
  period: ReaderSummaryPeriodDto.fromJson(
    json['period'] as Map<String, dynamic>,
  ),
  readerSummaryJobId: json['readerSummaryJobId'] as String,
  status: RequestReaderSummaryResponseDtoStatusStatus.fromJson(
    json['status'] as String,
  ),
);

Map<String, dynamic> _$RequestReaderSummaryResponseDtoToJson(
  RequestReaderSummaryResponseDto instance,
) => <String, dynamic>{
  'created': instance.created,
  'period': instance.period,
  'readerSummaryJobId': instance.readerSummaryJobId,
  'status': instance.status,
};
