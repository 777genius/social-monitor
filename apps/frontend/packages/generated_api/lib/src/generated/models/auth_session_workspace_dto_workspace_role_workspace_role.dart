// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum AuthSessionWorkspaceDtoWorkspaceRoleWorkspaceRole {
  @JsonValue('owner')
  owner('owner'),
  @JsonValue('admin')
  admin('admin'),
  @JsonValue('member')
  member('member'),
  @JsonValue('viewer')
  viewer('viewer'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const AuthSessionWorkspaceDtoWorkspaceRoleWorkspaceRole(this.json);

  factory AuthSessionWorkspaceDtoWorkspaceRoleWorkspaceRole.fromJson(
    String json,
  ) => values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;

  String toJson() => json ?? 'null';

  @override
  String toString() => json ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<AuthSessionWorkspaceDtoWorkspaceRoleWorkspaceRole>
  get $valuesDefined => values.where((value) => value != $unknown).toList();
}
