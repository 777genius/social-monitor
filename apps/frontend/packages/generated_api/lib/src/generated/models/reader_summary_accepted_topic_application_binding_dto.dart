// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reader_summary_accepted_topic_application_binding_dto.g.dart';

@JsonSerializable()
class ReaderSummaryAcceptedTopicApplicationBindingDto {
  const ReaderSummaryAcceptedTopicApplicationBindingDto({
    required this.changed,
    required this.changedConfigPaths,
    required this.interestId,
    required this.providerKey,
    required this.sourceBindingId,
  });

  factory ReaderSummaryAcceptedTopicApplicationBindingDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryAcceptedTopicApplicationBindingDtoFromJson(json);

  final bool changed;
  final List<String> changedConfigPaths;
  final String interestId;
  final String providerKey;
  final String sourceBindingId;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryAcceptedTopicApplicationBindingDtoToJson(this);
}
