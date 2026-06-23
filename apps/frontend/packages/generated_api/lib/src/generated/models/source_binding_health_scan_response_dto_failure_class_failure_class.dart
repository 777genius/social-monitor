// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum SourceBindingHealthScanResponseDtoFailureClassFailureClass {
  @JsonValue('provider_unavailable')
  providerUnavailable('provider_unavailable'),
  @JsonValue('provider_rate_limited')
  providerRateLimited('provider_rate_limited'),
  @JsonValue('worker_conflict')
  workerConflict('worker_conflict'),
  @JsonValue('system_failure')
  systemFailure('system_failure'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const SourceBindingHealthScanResponseDtoFailureClassFailureClass(this.json);

  factory SourceBindingHealthScanResponseDtoFailureClassFailureClass.fromJson(
    String json,
  ) => values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;

  String toJson() => json ?? 'null';

  @override
  String toString() => json ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<SourceBindingHealthScanResponseDtoFailureClassFailureClass>
  get $valuesDefined => values.where((value) => value != $unknown).toList();
}
