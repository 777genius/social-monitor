// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum ReaderSummaryProviderCollectionHealthDtoStateState {
  @JsonValue('complete')
  complete('complete'),
  @JsonValue('partial')
  partial('partial'),
  @JsonValue('degraded')
  degraded('degraded'),
  @JsonValue('unavailable')
  unavailable('unavailable'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const ReaderSummaryProviderCollectionHealthDtoStateState(this.json);

  factory ReaderSummaryProviderCollectionHealthDtoStateState.fromJson(
    String json,
  ) => values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;

  String toJson() => json ?? 'null';

  @override
  String toString() => json ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<ReaderSummaryProviderCollectionHealthDtoStateState>
  get $valuesDefined => values.where((value) => value != $unknown).toList();
}
