// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_claim_evidence_dto.dart';
import 'reader_summary_claim_risk_dto.dart';
import 'reader_summary_reader_item_confidence_dto.dart';

part 'reader_summary_claim_dto.g.dart';

@JsonSerializable()
class ReaderSummaryClaimDto {
  const ReaderSummaryClaimDto({
    required this.citationIds,
    required this.claim,
    required this.confidence,
    required this.evidence,
    required this.risks,
    this.id,
  });

  factory ReaderSummaryClaimDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryClaimDtoFromJson(json);

  final List<String> citationIds;
  final String claim;
  final ReaderSummaryReaderItemConfidenceDto confidence;
  final List<ReaderSummaryClaimEvidenceDto> evidence;
  final String? id;
  final List<ReaderSummaryClaimRiskDto> risks;

  Map<String, Object?> toJson() => _$ReaderSummaryClaimDtoToJson(this);
}
