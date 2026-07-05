// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reader_summary_quality_rejection_top_read_dto.g.dart';

@JsonSerializable()
class ReaderSummaryQualityRejectionTopReadDto {
  const ReaderSummaryQualityRejectionTopReadDto({
    required this.citationIds,
    required this.title,
    this.canonicalUrl,
    this.providerKey,
  });

  factory ReaderSummaryQualityRejectionTopReadDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryQualityRejectionTopReadDtoFromJson(json);

  final String? canonicalUrl;
  final List<String> citationIds;
  final String? providerKey;
  final String title;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryQualityRejectionTopReadDtoToJson(this);
}
