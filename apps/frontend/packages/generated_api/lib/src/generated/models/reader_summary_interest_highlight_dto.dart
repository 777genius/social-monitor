// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reader_summary_interest_highlight_dto.g.dart';

@JsonSerializable()
class ReaderSummaryInterestHighlightDto {
  const ReaderSummaryInterestHighlightDto({
    required this.citationIds,
    required this.interestId,
    required this.summary,
    required this.title,
  });

  factory ReaderSummaryInterestHighlightDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryInterestHighlightDtoFromJson(json);

  final List<String> citationIds;
  final String interestId;
  final String summary;
  final String title;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryInterestHighlightDtoToJson(this);
}
