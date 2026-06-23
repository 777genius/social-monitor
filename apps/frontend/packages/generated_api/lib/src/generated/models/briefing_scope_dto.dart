// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'briefing_scope_dto_type_type.dart';

part 'briefing_scope_dto.g.dart';

@JsonSerializable()
class BriefingScopeDto {
  const BriefingScopeDto({required this.type, this.topicId});

  factory BriefingScopeDto.fromJson(Map<String, Object?> json) =>
      _$BriefingScopeDtoFromJson(json);

  final String? topicId;
  final BriefingScopeDtoTypeType type;

  Map<String, Object?> toJson() => _$BriefingScopeDtoToJson(this);
}
