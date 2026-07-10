// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_narrative_section_dto_kind_kind.dart';

part 'reader_summary_narrative_section_dto.g.dart';

@JsonSerializable()
class ReaderSummaryNarrativeSectionDto {
  const ReaderSummaryNarrativeSectionDto({
    required this.citationIds,
    required this.id,
    required this.kind,
    required this.text,
    required this.title,
    this.storyClusterId,
  });

  factory ReaderSummaryNarrativeSectionDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryNarrativeSectionDtoFromJson(json);

  final List<String> citationIds;
  final String id;
  final ReaderSummaryNarrativeSectionDtoKindKind kind;
  final String? storyClusterId;
  final String text;
  final String title;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryNarrativeSectionDtoToJson(this);
}
