// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_period_summary_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryPeriodSummaryDto _$ReaderSummaryPeriodSummaryDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryPeriodSummaryDto(
  headline: json['headline'] as String,
  period: ReaderSummaryPeriodDto.fromJson(
    json['period'] as Map<String, dynamic>,
  ),
  readerSummaryId: json['readerSummaryId'] as String,
  scope: ReaderSummaryScopeDto.fromJson(json['scope'] as Map<String, dynamic>),
  status: ReaderSummaryPeriodSummaryDtoStatusStatus.fromJson(
    json['status'] as String,
  ),
  tenantId: json['tenantId'] as String,
  workspaceId: json['workspaceId'] as String,
  subscriptionId: json['subscriptionId'] as String?,
  userId: json['userId'] as String?,
);

Map<String, dynamic> _$ReaderSummaryPeriodSummaryDtoToJson(
  ReaderSummaryPeriodSummaryDto instance,
) => <String, dynamic>{
  'headline': instance.headline,
  'period': instance.period,
  'readerSummaryId': instance.readerSummaryId,
  'scope': instance.scope,
  'status': instance.status,
  'subscriptionId': instance.subscriptionId,
  'tenantId': instance.tenantId,
  'userId': instance.userId,
  'workspaceId': instance.workspaceId,
};
