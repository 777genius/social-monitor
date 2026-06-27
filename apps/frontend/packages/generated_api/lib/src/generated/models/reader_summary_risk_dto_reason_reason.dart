// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum ReaderSummaryRiskDtoReasonReason {
  @JsonValue('insufficient_evidence')
  insufficientEvidence('insufficient_evidence'),
  @JsonValue('conflicting_evidence')
  conflictingEvidence('conflicting_evidence'),
  @JsonValue('source_limit')
  sourceLimit('source_limit'),
  @JsonValue('provider_outage')
  providerOutage('provider_outage'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const ReaderSummaryRiskDtoReasonReason(this.json);

  factory ReaderSummaryRiskDtoReasonReason.fromJson(String json) =>
      values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;

  String toJson() => json ?? 'null';

  @override
  String toString() => json ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<ReaderSummaryRiskDtoReasonReason> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
