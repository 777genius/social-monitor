// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum RecordPostRatingRequestDtoReasonReason {
  @JsonValue('duplicate')
  duplicate('duplicate'),
  @JsonValue('off_topic')
  offTopic('off_topic'),
  @JsonValue('weak_source')
  weakSource('weak_source'),
  @JsonValue('too_old')
  tooOld('too_old'),
  @JsonValue('low_quality')
  lowQuality('low_quality'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const RecordPostRatingRequestDtoReasonReason(this.json);

  factory RecordPostRatingRequestDtoReasonReason.fromJson(String json) =>
      values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;

  String toJson() => json ?? 'null';

  @override
  String toString() => json ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<RecordPostRatingRequestDtoReasonReason> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
