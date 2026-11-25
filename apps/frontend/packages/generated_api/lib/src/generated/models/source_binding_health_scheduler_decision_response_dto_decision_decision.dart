// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum SourceBindingHealthSchedulerDecisionResponseDtoDecisionDecision {
  @JsonValue('ready')
  ready('ready'),
  @JsonValue('paused')
  paused('paused'),
  @JsonValue('not_configured')
  notConfigured('not_configured'),
  @JsonValue('active_scan')
  activeScan('active_scan'),
  @JsonValue('duplicate_window')
  duplicateWindow('duplicate_window'),
  @JsonValue('fresh_success')
  freshSuccess('fresh_success'),
  @JsonValue('rate_limit_backoff')
  rateLimitBackoff('rate_limit_backoff'),
  @JsonValue('provider_failure_backoff')
  providerFailureBackoff('provider_failure_backoff'),
  @JsonValue('scheduled_later')
  scheduledLater('scheduled_later'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const SourceBindingHealthSchedulerDecisionResponseDtoDecisionDecision(
    this.json,
  );

  factory SourceBindingHealthSchedulerDecisionResponseDtoDecisionDecision.fromJson(
    String json,
  ) => values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;

  String toJson() => json ?? 'null';

  @override
  String toString() => json ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<SourceBindingHealthSchedulerDecisionResponseDtoDecisionDecision>
  get $valuesDefined => values.where((value) => value != $unknown).toList();
}
