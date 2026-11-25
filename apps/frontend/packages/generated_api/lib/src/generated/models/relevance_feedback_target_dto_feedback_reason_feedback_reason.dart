// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum RelevanceFeedbackTargetDtoFeedbackReasonFeedbackReason {
  @JsonValue('not_same_story')
  notSameStory('not_same_story'),
  @JsonValue('duplicate')
  duplicate('duplicate'),
  @JsonValue('low_quality_source')
  lowQualitySource('low_quality_source'),
  @JsonValue('overrated_provider')
  overratedProvider('overrated_provider'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const RelevanceFeedbackTargetDtoFeedbackReasonFeedbackReason(this.json);

  factory RelevanceFeedbackTargetDtoFeedbackReasonFeedbackReason.fromJson(
    String json,
  ) => values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;

  String toJson() => json ?? 'null';

  @override
  String toString() => json ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<RelevanceFeedbackTargetDtoFeedbackReasonFeedbackReason>
  get $valuesDefined => values.where((value) => value != $unknown).toList();
}
