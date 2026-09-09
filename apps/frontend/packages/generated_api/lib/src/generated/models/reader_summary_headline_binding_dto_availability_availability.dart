// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum ReaderSummaryHeadlineBindingDtoAvailabilityAvailability {
  @JsonValue('title_only')
  titleOnly('title_only'),
  @JsonValue('body_present')
  bodyPresent('body_present'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const ReaderSummaryHeadlineBindingDtoAvailabilityAvailability(this.json);

  factory ReaderSummaryHeadlineBindingDtoAvailabilityAvailability.fromJson(
    String json,
  ) => values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;

  String toJson() => json ?? 'null';

  @override
  String toString() => json ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<ReaderSummaryHeadlineBindingDtoAvailabilityAvailability>
  get $valuesDefined => values.where((value) => value != $unknown).toList();
}
