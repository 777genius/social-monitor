// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum ReaderSummaryPromotionV3ComparatorDtoRelevanceRelevance {
  @JsonValue('unrelated')
  unrelated('unrelated'),
  @JsonValue('adjacent')
  adjacent('adjacent'),
  @JsonValue('relevant')
  relevant('relevant'),
  @JsonValue('central')
  central('central'),
  @JsonValue('insufficient_context')
  insufficientContext('insufficient_context'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const ReaderSummaryPromotionV3ComparatorDtoRelevanceRelevance(this.json);

  factory ReaderSummaryPromotionV3ComparatorDtoRelevanceRelevance.fromJson(
    String json,
  ) => values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;

  String toJson() => json ?? 'null';

  @override
  String toString() => json ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<ReaderSummaryPromotionV3ComparatorDtoRelevanceRelevance>
  get $valuesDefined => values.where((value) => value != $unknown).toList();
}
