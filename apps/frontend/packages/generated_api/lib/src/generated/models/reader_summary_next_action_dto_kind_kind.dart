// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum ReaderSummaryNextActionDtoKindKind {
  @JsonValue('read_source')
  readSource('read_source'),
  @JsonValue('watch_repository')
  watchRepository('watch_repository'),
  @JsonValue('monitor_interest')
  monitorInterest('monitor_interest'),
  @JsonValue('compare_sources')
  compareSources('compare_sources'),
  @JsonValue('ignore_low_confidence')
  ignoreLowConfidence('ignore_low_confidence'),
  @JsonValue('add_interest_rule')
  addInterestRule('add_interest_rule'),
  @JsonValue('request_deeper_scan')
  requestDeeperScan('request_deeper_scan'),
  @JsonValue('mark_relevant')
  markRelevant('mark_relevant'),
  @JsonValue('mark_not_relevant')
  markNotRelevant('mark_not_relevant'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const ReaderSummaryNextActionDtoKindKind(this.json);

  factory ReaderSummaryNextActionDtoKindKind.fromJson(String json) =>
      values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;

  String toJson() => json ?? 'null';

  @override
  String toString() => json ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<ReaderSummaryNextActionDtoKindKind> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
