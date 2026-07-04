// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reader_summary_claim_evidence_dto.g.dart';

@JsonSerializable()
class ReaderSummaryClaimEvidenceDto {
  const ReaderSummaryClaimEvidenceDto({
    required this.citationId,
    required this.providerKey,
    required this.title,
    this.canonicalUrl,
  });

  factory ReaderSummaryClaimEvidenceDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryClaimEvidenceDtoFromJson(json);

  final String? canonicalUrl;
  final String citationId;
  final String providerKey;
  final String title;

  Map<String, Object?> toJson() => _$ReaderSummaryClaimEvidenceDtoToJson(this);
}
