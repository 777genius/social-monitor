// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum SourceBindingHealthScanResponseDtoUserStateUserState {
  @JsonValue('scan_pending')
  scanPending('scan_pending'),
  @JsonValue('scan_in_progress')
  scanInProgress('scan_in_progress'),
  @JsonValue('content_current')
  contentCurrent('content_current'),
  @JsonValue('scan_degraded')
  scanDegraded('scan_degraded'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const SourceBindingHealthScanResponseDtoUserStateUserState(this.json);

  factory SourceBindingHealthScanResponseDtoUserStateUserState.fromJson(
    String json,
  ) => values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;

  String toJson() => json ?? 'null';

  @override
  String toString() => json ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<SourceBindingHealthScanResponseDtoUserStateUserState>
  get $valuesDefined => values.where((value) => value != $unknown).toList();
}
