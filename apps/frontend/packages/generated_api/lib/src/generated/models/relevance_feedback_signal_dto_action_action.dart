// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum RelevanceFeedbackSignalDtoActionAction {
  @JsonValue('more_like_this')
  moreLikeThis('more_like_this'),
  @JsonValue('less_like_this')
  lessLikeThis('less_like_this'),
  @JsonValue('hide_source')
  hideSource('hide_source'),
  @JsonValue('dismiss')
  dismiss('dismiss'),
  @JsonValue('save')
  save('save'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const RelevanceFeedbackSignalDtoActionAction(this.json);

  factory RelevanceFeedbackSignalDtoActionAction.fromJson(String json) =>
      values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;

  String toJson() => json ?? 'null';

  @override
  String toString() => json ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<RelevanceFeedbackSignalDtoActionAction> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
