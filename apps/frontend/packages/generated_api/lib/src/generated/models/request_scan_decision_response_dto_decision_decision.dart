// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum RequestScanDecisionResponseDtoDecisionDecision {
  @JsonValue('created')
  created('created'),
  @JsonValue('idempotent_replay')
  idempotentReplay('idempotent_replay'),
  @JsonValue('active_scan')
  activeScan('active_scan'),
  @JsonValue('fresh_success')
  freshSuccess('fresh_success'),
  @JsonValue('rate_limit_backoff')
  rateLimitBackoff('rate_limit_backoff'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const RequestScanDecisionResponseDtoDecisionDecision(this.json);

  factory RequestScanDecisionResponseDtoDecisionDecision.fromJson(
    String json,
  ) => values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;

  String toJson() => json ?? 'null';

  @override
  String toString() => json ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<RequestScanDecisionResponseDtoDecisionDecision>
  get $valuesDefined => values.where((value) => value != $unknown).toList();
}
