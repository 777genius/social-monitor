// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_bootstrap_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryBootstrapResponseDto _$ReaderSummaryBootstrapResponseDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryBootstrapResponseDto(
  latest: ListReaderSummariesResponseDto.fromJson(
    json['latest'] as Map<String, dynamic>,
  ),
  periods: ListReaderSummaryPeriodsResponseDto.fromJson(
    json['periods'] as Map<String, dynamic>,
  ),
  tenantId: json['tenantId'] as String,
  workspaceId: json['workspaceId'] as String,
);

Map<String, dynamic> _$ReaderSummaryBootstrapResponseDtoToJson(
  ReaderSummaryBootstrapResponseDto instance,
) => <String, dynamic>{
  'latest': instance.latest,
  'periods': instance.periods,
  'tenantId': instance.tenantId,
  'workspaceId': instance.workspaceId,
};
