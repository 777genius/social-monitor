// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum ReaderSummaryResponseDtoQualityFlagsQualityFlags {
  @JsonValue('no_signal')
  noSignal('no_signal'),
  @JsonValue('low_confidence')
  lowConfidence('low_confidence'),
  @JsonValue('conflicting_evidence')
  conflictingEvidence('conflicting_evidence'),
  @JsonValue('limited_sources')
  limitedSources('limited_sources'),
  @JsonValue('partial_evidence')
  partialEvidence('partial_evidence'),
  @JsonValue('context_unavailable')
  contextUnavailable('context_unavailable'),
  @JsonValue('provider_failed')
  providerFailed('provider_failed'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const ReaderSummaryResponseDtoQualityFlagsQualityFlags(this.json);

  factory ReaderSummaryResponseDtoQualityFlagsQualityFlags.fromJson(
    String json,
  ) => values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;

  String toJson() => json ?? 'null';

  @override
  String toString() => json ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<ReaderSummaryResponseDtoQualityFlagsQualityFlags>
  get $valuesDefined => values.where((value) => value != $unknown).toList();
}
