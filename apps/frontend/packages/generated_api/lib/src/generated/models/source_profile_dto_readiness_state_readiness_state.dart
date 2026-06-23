// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum SourceProfileDtoReadinessStateReadinessState {
  @JsonValue('research_only')
  researchOnly('research_only'),
  @JsonValue('profiled')
  profiled('profiled'),
  @JsonValue('certification_ready')
  certificationReady('certification_ready'),
  @JsonValue('enabled_beta')
  enabledBeta('enabled_beta'),
  @JsonValue('provider_only')
  providerOnly('provider_only'),
  @JsonValue('manual_only')
  manualOnly('manual_only'),
  @JsonValue('rejected')
  rejected('rejected'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const SourceProfileDtoReadinessStateReadinessState(this.json);

  factory SourceProfileDtoReadinessStateReadinessState.fromJson(String json) =>
      values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;

  String toJson() => json ?? 'null';

  @override
  String toString() => json ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<SourceProfileDtoReadinessStateReadinessState>
  get $valuesDefined => values.where((value) => value != $unknown).toList();
}
