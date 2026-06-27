// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'request_reader_summary_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RequestReaderSummaryRequestDto _$RequestReaderSummaryRequestDtoFromJson(
  Map<String, dynamic> json,
) => RequestReaderSummaryRequestDto(
  scope: ReaderSummaryScopeDto.fromJson(json['scope'] as Map<String, dynamic>),
  cadence: json['cadence'] == null
      ? null
      : RequestReaderSummaryRequestDtoCadenceCadence.fromJson(
          json['cadence'] as String,
        ),
  period: json['period'] == null
      ? null
      : RequestReaderSummaryPeriodDto.fromJson(
          json['period'] as Map<String, dynamic>,
        ),
  subscriptionId: json['subscriptionId'] as String?,
  timezone: json['timezone'] as String?,
  userId: json['userId'] as String?,
);

Map<String, dynamic> _$RequestReaderSummaryRequestDtoToJson(
  RequestReaderSummaryRequestDto instance,
) => <String, dynamic>{
  'cadence': instance.cadence,
  'period': instance.period,
  'scope': instance.scope,
  'subscriptionId': instance.subscriptionId,
  'timezone': instance.timezone,
  'userId': instance.userId,
};
