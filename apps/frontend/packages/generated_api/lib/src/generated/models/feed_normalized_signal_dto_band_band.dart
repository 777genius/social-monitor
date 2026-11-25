// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum FeedNormalizedSignalDtoBandBand {
  @JsonValue('no_signal')
  noSignal('no_signal'),
  @JsonValue('low')
  low('low'),
  @JsonValue('normal')
  normal('normal'),
  @JsonValue('high')
  high('high'),
  @JsonValue('breakout')
  breakout('breakout'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const FeedNormalizedSignalDtoBandBand(this.json);

  factory FeedNormalizedSignalDtoBandBand.fromJson(String json) =>
      values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;

  String toJson() => json ?? 'null';

  @override
  String toString() => json ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<FeedNormalizedSignalDtoBandBand> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
