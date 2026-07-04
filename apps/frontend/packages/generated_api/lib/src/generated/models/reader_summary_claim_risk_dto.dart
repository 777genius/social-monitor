// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_claim_risk_dto_kind_kind.dart';

part 'reader_summary_claim_risk_dto.g.dart';

@JsonSerializable()
class ReaderSummaryClaimRiskDto {
  const ReaderSummaryClaimRiskDto({
    required this.description,
    required this.kind,
  });

  factory ReaderSummaryClaimRiskDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryClaimRiskDtoFromJson(json);

  final String description;
  final ReaderSummaryClaimRiskDtoKindKind kind;

  Map<String, Object?> toJson() => _$ReaderSummaryClaimRiskDtoToJson(this);
}
