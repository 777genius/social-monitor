// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum ReaderSummaryPromotionV3AssessmentDtoSchemaVersionSchemaVersion {
  /// Incorrect name has been replaced. Original name: `reader_value.v1`.
  @JsonValue('reader_value.v1')
  undefined0('reader_value.v1'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const ReaderSummaryPromotionV3AssessmentDtoSchemaVersionSchemaVersion(
    this.json,
  );

  factory ReaderSummaryPromotionV3AssessmentDtoSchemaVersionSchemaVersion.fromJson(
    String json,
  ) => values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;

  String toJson() => json ?? 'null';

  @override
  String toString() => json ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<ReaderSummaryPromotionV3AssessmentDtoSchemaVersionSchemaVersion>
  get $valuesDefined => values.where((value) => value != $unknown).toList();
}
