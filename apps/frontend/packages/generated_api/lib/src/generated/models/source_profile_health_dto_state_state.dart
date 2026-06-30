// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum SourceProfileHealthDtoStateState {
  @JsonValue('healthy')
  healthy('healthy'),
  @JsonValue('stale')
  stale('stale'),
  @JsonValue('rate_limited')
  rateLimited('rate_limited'),
  @JsonValue('auth_failed')
  authFailed('auth_failed'),
  @JsonValue('degraded')
  degraded('degraded'),
  @JsonValue('unsupported_scope')
  unsupportedScope('unsupported_scope'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const SourceProfileHealthDtoStateState(this.json);

  factory SourceProfileHealthDtoStateState.fromJson(String json) =>
      values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;

  String toJson() => json ?? 'null';

  @override
  String toString() => json ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<SourceProfileHealthDtoStateState> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
