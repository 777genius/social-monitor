// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum ReaderSummaryAcceptedTopicApplicationDtoStatusStatus {
  @JsonValue('not_requested')
  notRequested('not_requested'),
  @JsonValue('applied')
  applied('applied'),
  @JsonValue('already_applied')
  alreadyApplied('already_applied'),
  @JsonValue('no_supported_bindings')
  noSupportedBindings('no_supported_bindings'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const ReaderSummaryAcceptedTopicApplicationDtoStatusStatus(this.json);

  factory ReaderSummaryAcceptedTopicApplicationDtoStatusStatus.fromJson(
    String json,
  ) => values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;

  String toJson() => json ?? 'null';

  @override
  String toString() => json ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<ReaderSummaryAcceptedTopicApplicationDtoStatusStatus>
  get $valuesDefined => values.where((value) => value != $unknown).toList();
}
