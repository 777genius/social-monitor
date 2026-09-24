// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_display_headline_seal_dto.dart';
import 'reader_summary_promotion_v3_presentation_dto_schema_version_schema_version.dart';

part 'reader_summary_promotion_v3_presentation_dto.g.dart';

@JsonSerializable()
class ReaderSummaryPromotionV3PresentationDto {
  const ReaderSummaryPromotionV3PresentationDto({
    required this.displayHeadline,
    required this.presentationInputDigest,
    required this.presentationIdentity,
    required this.schemaVersion,
  });

  factory ReaderSummaryPromotionV3PresentationDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryPromotionV3PresentationDtoFromJson(json);

  final ReaderSummaryDisplayHeadlineSealDto displayHeadline;
  final String presentationInputDigest;
  final String presentationIdentity;
  final ReaderSummaryPromotionV3PresentationDtoSchemaVersionSchemaVersion
  schemaVersion;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryPromotionV3PresentationDtoToJson(this);
}
