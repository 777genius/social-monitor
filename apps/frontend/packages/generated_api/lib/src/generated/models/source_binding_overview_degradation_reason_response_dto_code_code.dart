// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum SourceBindingOverviewDegradationReasonResponseDtoCodeCode {
  @JsonValue('rate_limited')
  rateLimited('rate_limited'),
  @JsonValue('auth_failed')
  authFailed('auth_failed'),
  @JsonValue('unsupported_scope')
  unsupportedScope('unsupported_scope'),
  @JsonValue('provider_unavailable')
  providerUnavailable('provider_unavailable'),
  @JsonValue('provider_down')
  providerDown('provider_down'),
  @JsonValue('stale_data')
  staleData('stale_data'),
  @JsonValue('scan_policy_missing')
  scanPolicyMissing('scan_policy_missing'),
  @JsonValue('source_paused')
  sourcePaused('source_paused'),
  @JsonValue('worker_conflict')
  workerConflict('worker_conflict'),
  @JsonValue('system_failure')
  systemFailure('system_failure'),
  @JsonValue('degraded')
  degraded('degraded'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const SourceBindingOverviewDegradationReasonResponseDtoCodeCode(this.json);

  factory SourceBindingOverviewDegradationReasonResponseDtoCodeCode.fromJson(
    String json,
  ) => values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;

  String toJson() => json ?? 'null';

  @override
  String toString() => json ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<SourceBindingOverviewDegradationReasonResponseDtoCodeCode>
  get $valuesDefined => values.where((value) => value != $unknown).toList();
}
