// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum HackerNewsCommentProviderMetricsDtoRoleRole {
  @JsonValue('top_level_comment')
  topLevelComment('top_level_comment'),
  @JsonValue('reply')
  reply('reply'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const HackerNewsCommentProviderMetricsDtoRoleRole(this.json);

  factory HackerNewsCommentProviderMetricsDtoRoleRole.fromJson(String json) =>
      values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;

  String toJson() => json ?? 'null';

  @override
  String toString() => json ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<HackerNewsCommentProviderMetricsDtoRoleRole> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
