// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reader_summary_accepted_topic_reversion_binding_dto.g.dart';

@JsonSerializable()
class ReaderSummaryAcceptedTopicReversionBindingDto {
  const ReaderSummaryAcceptedTopicReversionBindingDto({
    required this.interestId,
    required this.providerKey,
    required this.restoredConfigPaths,
    required this.reverted,
    required this.sourceBindingId,
    this.reason,
  });

  factory ReaderSummaryAcceptedTopicReversionBindingDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryAcceptedTopicReversionBindingDtoFromJson(json);

  final String interestId;
  final String providerKey;
  final String? reason;
  final List<String> restoredConfigPaths;
  final bool reverted;
  final String sourceBindingId;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryAcceptedTopicReversionBindingDtoToJson(this);
}
