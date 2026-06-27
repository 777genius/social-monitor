// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum ReaderSummaryFreshnessDtoReasonReason {
  @JsonValue('new_evidence_after_window')
  newEvidenceAfterWindow('new_evidence_after_window'),
  @JsonValue('topic_bindings_changed')
  topicBindingsChanged('topic_bindings_changed'),
  @JsonValue('reader_summary_policy_changed')
  readerSummaryPolicyChanged('reader_summary_policy_changed'),
  @JsonValue('ranking_policy_changed')
  rankingPolicyChanged('ranking_policy_changed'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const ReaderSummaryFreshnessDtoReasonReason(this.json);

  factory ReaderSummaryFreshnessDtoReasonReason.fromJson(String json) =>
      values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;

  String toJson() => json ?? 'null';

  @override
  String toString() => json ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<ReaderSummaryFreshnessDtoReasonReason> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
