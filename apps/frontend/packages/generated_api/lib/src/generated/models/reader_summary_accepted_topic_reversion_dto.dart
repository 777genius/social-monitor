// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_accepted_topic_reversion_binding_dto.dart';
import 'reader_summary_accepted_topic_reversion_dto_status_status.dart';

part 'reader_summary_accepted_topic_reversion_dto.g.dart';

@JsonSerializable()
class ReaderSummaryAcceptedTopicReversionDto {
  const ReaderSummaryAcceptedTopicReversionDto({
    required this.revertedSourceBindingCount,
    required this.sourceBindingReversions,
    required this.status,
  });

  factory ReaderSummaryAcceptedTopicReversionDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryAcceptedTopicReversionDtoFromJson(json);

  final num revertedSourceBindingCount;
  final List<ReaderSummaryAcceptedTopicReversionBindingDto>
  sourceBindingReversions;
  final ReaderSummaryAcceptedTopicReversionDtoStatusStatus status;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryAcceptedTopicReversionDtoToJson(this);
}
