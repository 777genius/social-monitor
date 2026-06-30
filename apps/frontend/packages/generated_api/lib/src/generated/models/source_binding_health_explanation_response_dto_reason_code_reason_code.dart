// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum SourceBindingHealthExplanationResponseDtoReasonCodeReasonCode {
  @JsonValue('source_healthy')
  sourceHealthy('source_healthy'),
  @JsonValue('source_stale')
  sourceStale('source_stale'),
  @JsonValue('source_rate_limited')
  sourceRateLimited('source_rate_limited'),
  @JsonValue('source_auth_failed')
  sourceAuthFailed('source_auth_failed'),
  @JsonValue('source_degraded')
  sourceDegraded('source_degraded'),
  @JsonValue('source_unsupported_scope')
  sourceUnsupportedScope('source_unsupported_scope'),
  @JsonValue('source_paused')
  sourcePaused('source_paused'),
  @JsonValue('source_not_configured')
  sourceNotConfigured('source_not_configured'),
  @JsonValue('source_scheduled')
  sourceScheduled('source_scheduled'),
  @JsonValue('source_scanning')
  sourceScanning('source_scanning'),
  @JsonValue('source_down')
  sourceDown('source_down'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const SourceBindingHealthExplanationResponseDtoReasonCodeReasonCode(
    this.json,
  );

  factory SourceBindingHealthExplanationResponseDtoReasonCodeReasonCode.fromJson(
    String json,
  ) => values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;

  String toJson() => json ?? 'null';

  @override
  String toString() => json ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<SourceBindingHealthExplanationResponseDtoReasonCodeReasonCode>
  get $valuesDefined => values.where((value) => value != $unknown).toList();
}
