// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum ReaderSummaryPromotionV3ComparatorDtoUsefulnessUsefulness {
  @JsonValue('noise')
  noise('noise'),
  @JsonValue('context')
  context('context'),
  @JsonValue('useful')
  useful('useful'),
  @JsonValue('important')
  important('important'),
  @JsonValue('insufficient_context')
  insufficientContext('insufficient_context'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const ReaderSummaryPromotionV3ComparatorDtoUsefulnessUsefulness(this.json);

  factory ReaderSummaryPromotionV3ComparatorDtoUsefulnessUsefulness.fromJson(
    String json,
  ) => values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;

  String toJson() => json ?? 'null';

  @override
  String toString() => json ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<ReaderSummaryPromotionV3ComparatorDtoUsefulnessUsefulness>
  get $valuesDefined => values.where((value) => value != $unknown).toList();
}
