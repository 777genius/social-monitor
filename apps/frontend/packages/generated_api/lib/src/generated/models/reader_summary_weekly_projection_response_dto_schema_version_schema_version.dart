// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum ReaderSummaryWeeklyProjectionResponseDtoSchemaVersionSchemaVersion {
  /// Incorrect name has been replaced. Original name: `reader_summary.weekly_projection.v1`.
  @JsonValue('reader_summary.weekly_projection.v1')
  undefined0('reader_summary.weekly_projection.v1'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const ReaderSummaryWeeklyProjectionResponseDtoSchemaVersionSchemaVersion(
    this.json,
  );

  factory ReaderSummaryWeeklyProjectionResponseDtoSchemaVersionSchemaVersion.fromJson(
    String json,
  ) => values.firstWhere(
    (e) => e.json == json,
    orElse: () => $unknown,
  );

  final String? json;

  String toJson() => json ?? 'null';

  @override
  String toString() => json ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<
    ReaderSummaryWeeklyProjectionResponseDtoSchemaVersionSchemaVersion
  >
  get $valuesDefined => values.where((value) => value != $unknown).toList();
}
