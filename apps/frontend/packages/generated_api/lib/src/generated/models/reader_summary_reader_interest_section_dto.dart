// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_reader_item_dto.dart';

part 'reader_summary_reader_interest_section_dto.g.dart';

@JsonSerializable()
class ReaderSummaryReaderInterestSectionDto {
  const ReaderSummaryReaderInterestSectionDto({
    required this.citationIds,
    required this.insight,
    required this.items,
    required this.title,
    this.interestId,
  });

  factory ReaderSummaryReaderInterestSectionDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryReaderInterestSectionDtoFromJson(json);

  final List<String> citationIds;
  final String insight;
  final String? interestId;
  final List<ReaderSummaryReaderItemDto> items;
  final String title;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryReaderInterestSectionDtoToJson(this);
}
