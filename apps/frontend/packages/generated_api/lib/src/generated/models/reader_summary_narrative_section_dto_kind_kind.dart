// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum ReaderSummaryNarrativeSectionDtoKindKind {
  @JsonValue('lead')
  lead('lead'),
  @JsonValue('main_signal')
  mainSignal('main_signal'),
  @JsonValue('why_it_matters')
  whyItMatters('why_it_matters'),
  @JsonValue('secondary_signal')
  secondarySignal('secondary_signal'),
  @JsonValue('watch')
  watch('watch'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const ReaderSummaryNarrativeSectionDtoKindKind(this.json);

  factory ReaderSummaryNarrativeSectionDtoKindKind.fromJson(String json) =>
      values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;

  String toJson() => json ?? 'null';

  @override
  String toString() => json ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<ReaderSummaryNarrativeSectionDtoKindKind> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
