// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reader_summary_repeated_signal_dto.g.dart';

@JsonSerializable()
class ReaderSummaryRepeatedSignalDto {
  const ReaderSummaryRepeatedSignalDto({
    required this.citationIds,
    required this.interestIds,
    required this.storyClusterId,
    required this.title,
  });

  factory ReaderSummaryRepeatedSignalDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryRepeatedSignalDtoFromJson(json);

  final List<String> citationIds;
  final List<String> interestIds;
  final String storyClusterId;
  final String title;

  Map<String, Object?> toJson() => _$ReaderSummaryRepeatedSignalDtoToJson(this);
}
