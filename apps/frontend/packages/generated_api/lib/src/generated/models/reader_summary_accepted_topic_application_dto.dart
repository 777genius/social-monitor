// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_accepted_topic_application_binding_dto.dart';
import 'reader_summary_accepted_topic_application_dto_status_status.dart';

part 'reader_summary_accepted_topic_application_dto.g.dart';

@JsonSerializable()
class ReaderSummaryAcceptedTopicApplicationDto {
  const ReaderSummaryAcceptedTopicApplicationDto({
    required this.changedSourceBindingCount,
    required this.sourceBindingUpdates,
    required this.status,
  });

  factory ReaderSummaryAcceptedTopicApplicationDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryAcceptedTopicApplicationDtoFromJson(json);

  final num changedSourceBindingCount;
  final List<ReaderSummaryAcceptedTopicApplicationBindingDto>
  sourceBindingUpdates;
  final ReaderSummaryAcceptedTopicApplicationDtoStatusStatus status;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryAcceptedTopicApplicationDtoToJson(this);
}
