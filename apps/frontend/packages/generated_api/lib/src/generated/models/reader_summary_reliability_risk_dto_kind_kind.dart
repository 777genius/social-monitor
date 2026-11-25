// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum ReaderSummaryReliabilityRiskDtoKindKind {
  @JsonValue('duplicate_risk')
  duplicateRisk('duplicate_risk'),
  @JsonValue('stale_evidence')
  staleEvidence('stale_evidence'),
  @JsonValue('single_source')
  singleSource('single_source'),
  @JsonValue('weak_source')
  weakSource('weak_source'),
  @JsonValue('low_evidence_diversity')
  lowEvidenceDiversity('low_evidence_diversity'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const ReaderSummaryReliabilityRiskDtoKindKind(this.json);

  factory ReaderSummaryReliabilityRiskDtoKindKind.fromJson(String json) =>
      values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;

  String toJson() => json ?? 'null';

  @override
  String toString() => json ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<ReaderSummaryReliabilityRiskDtoKindKind> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
