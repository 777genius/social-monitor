// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// Source registry class; unranked posts are only in the news block.
@JsonEnum()
enum ReaderSummaryPromotionV3ComparatorDtoBlockBlock {
  @JsonValue('ranked')
  ranked('ranked'),
  @JsonValue('unranked')
  unranked('unranked'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const ReaderSummaryPromotionV3ComparatorDtoBlockBlock(this.json);

  factory ReaderSummaryPromotionV3ComparatorDtoBlockBlock.fromJson(
    String json,
  ) => values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;

  String toJson() => json ?? 'null';

  @override
  String toString() => json ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<ReaderSummaryPromotionV3ComparatorDtoBlockBlock>
  get $valuesDefined => values.where((value) => value != $unknown).toList();
}
