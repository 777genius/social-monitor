// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'request_reader_summary_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RequestReaderSummaryRequestDto _$RequestReaderSummaryRequestDtoFromJson(
  Map<String, dynamic> json,
) => RequestReaderSummaryRequestDto(
  scope: ReaderSummaryScopeDto.fromJson(json['scope'] as Map<String, dynamic>),
  subscriptionId: json['subscriptionId'] as String?,
  userId: json['userId'] as String?,
);

Map<String, dynamic> _$RequestReaderSummaryRequestDtoToJson(
  RequestReaderSummaryRequestDto instance,
) => <String, dynamic>{
  'scope': instance.scope,
  'subscriptionId': instance.subscriptionId,
  'userId': instance.userId,
};
