// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum ReaderSummaryWeeklyProjectionResponseDtoBlockingReasonsBlockingReasons {
  @JsonValue('certified_daily_evidence_incomplete')
  certifiedDailyEvidenceIncomplete('certified_daily_evidence_incomplete'),
  @JsonValue('active_weekly_certified_artifact_missing')
  activeWeeklyCertifiedArtifactMissing(
    'active_weekly_certified_artifact_missing',
  ),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const ReaderSummaryWeeklyProjectionResponseDtoBlockingReasonsBlockingReasons(
    this.json,
  );

  factory ReaderSummaryWeeklyProjectionResponseDtoBlockingReasonsBlockingReasons.fromJson(
    String json,
  ) => values.firstWhere(
    (e) => e.json == json,
    orElse: () => $unknown,
  );

  final String? json;

  String toJson() => json ?? 'null';

  @override
  String toString() => json ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<
    ReaderSummaryWeeklyProjectionResponseDtoBlockingReasonsBlockingReasons
  >
  get $valuesDefined => values.where((value) => value != $unknown).toList();
}
