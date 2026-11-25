// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reader_summary_quality_rejection_violation_dto.g.dart';

@JsonSerializable()
class ReaderSummaryQualityRejectionViolationDto {
  const ReaderSummaryQualityRejectionViolationDto({
    required this.code,
    required this.reason,
    this.canonicalUrl,
    this.citationId,
    this.feedItemId,
    this.providerKey,
    this.sourceItemId,
    this.topReadTitle,
  });

  factory ReaderSummaryQualityRejectionViolationDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryQualityRejectionViolationDtoFromJson(json);

  final String? canonicalUrl;
  final String? citationId;
  final String code;
  final String? feedItemId;
  final String? providerKey;
  final String reason;
  final String? sourceItemId;
  final String? topReadTitle;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryQualityRejectionViolationDtoToJson(this);
}
