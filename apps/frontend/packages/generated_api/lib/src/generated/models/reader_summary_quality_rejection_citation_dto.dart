// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reader_summary_quality_rejection_citation_dto.g.dart';

@JsonSerializable()
class ReaderSummaryQualityRejectionCitationDto {
  const ReaderSummaryQualityRejectionCitationDto({
    required this.citationId,
    required this.feedItemId,
    required this.providerKey,
    required this.sourceItemId,
    this.canonicalUrl,
  });

  factory ReaderSummaryQualityRejectionCitationDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryQualityRejectionCitationDtoFromJson(json);

  final String? canonicalUrl;
  final String citationId;
  final String feedItemId;
  final String providerKey;
  final String sourceItemId;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryQualityRejectionCitationDtoToJson(this);
}
