// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum ReaderSummaryAcceptedTopicReversionDtoStatusStatus {
  @JsonValue('not_requested')
  notRequested('not_requested'),
  @JsonValue('reverted')
  reverted('reverted'),
  @JsonValue('partially_reverted')
  partiallyReverted('partially_reverted'),
  @JsonValue('nothing_to_revert')
  nothingToRevert('nothing_to_revert'),
  @JsonValue('blocked')
  blocked('blocked'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const ReaderSummaryAcceptedTopicReversionDtoStatusStatus(this.json);

  factory ReaderSummaryAcceptedTopicReversionDtoStatusStatus.fromJson(
    String json,
  ) => values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;

  String toJson() => json ?? 'null';

  @override
  String toString() => json ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<ReaderSummaryAcceptedTopicReversionDtoStatusStatus>
  get $valuesDefined => values.where((value) => value != $unknown).toList();
}
