// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_claim_risk_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryClaimRiskDto _$ReaderSummaryClaimRiskDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryClaimRiskDto(
  description: json['description'] as String,
  kind: ReaderSummaryClaimRiskDtoKindKind.fromJson(json['kind'] as String),
);

Map<String, dynamic> _$ReaderSummaryClaimRiskDtoToJson(
  ReaderSummaryClaimRiskDto instance,
) => <String, dynamic>{
  'description': instance.description,
  'kind': instance.kind,
};
