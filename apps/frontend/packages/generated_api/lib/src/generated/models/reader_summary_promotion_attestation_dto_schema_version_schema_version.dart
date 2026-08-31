// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum ReaderSummaryPromotionAttestationDtoSchemaVersionSchemaVersion {
  /// Incorrect name has been replaced. Original name: `reader_post_promotion_attestation.v1`.
  @JsonValue('reader_post_promotion_attestation.v1')
  undefined0('reader_post_promotion_attestation.v1'),

  /// Incorrect name has been replaced. Original name: `reader_post_promotion_attestation.v2`.
  @JsonValue('reader_post_promotion_attestation.v2')
  undefined1('reader_post_promotion_attestation.v2'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const ReaderSummaryPromotionAttestationDtoSchemaVersionSchemaVersion(
    this.json,
  );

  factory ReaderSummaryPromotionAttestationDtoSchemaVersionSchemaVersion.fromJson(
    String json,
  ) => values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;

  String toJson() => json ?? 'null';

  @override
  String toString() => json ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<ReaderSummaryPromotionAttestationDtoSchemaVersionSchemaVersion>
  get $valuesDefined => values.where((value) => value != $unknown).toList();
}
