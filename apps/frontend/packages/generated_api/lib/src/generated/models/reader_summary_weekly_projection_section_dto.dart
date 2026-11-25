// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_weekly_projection_section_dto_claim_type_claim_type.dart';
import 'reader_summary_weekly_projection_section_dto_kind_kind.dart';

part 'reader_summary_weekly_projection_section_dto.g.dart';

@JsonSerializable()
class ReaderSummaryWeeklyProjectionSectionDto {
  const ReaderSummaryWeeklyProjectionSectionDto({
    required this.citationIds,
    required this.claimType,
    required this.heading,
    required this.kind,
    required this.observedFrom,
    required this.observedThrough,
    required this.sectionId,
    required this.storyId,
    required this.text,
  });

  factory ReaderSummaryWeeklyProjectionSectionDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryWeeklyProjectionSectionDtoFromJson(json);

  final List<String> citationIds;
  final ReaderSummaryWeeklyProjectionSectionDtoClaimTypeClaimType claimType;
  final String heading;
  final ReaderSummaryWeeklyProjectionSectionDtoKindKind kind;
  final DateTime observedFrom;
  final DateTime observedThrough;
  final String sectionId;
  final String storyId;
  final String text;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryWeeklyProjectionSectionDtoToJson(this);
}
