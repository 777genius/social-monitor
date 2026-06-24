// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'source_content_safety_dto_categories_categories.dart';
import 'source_content_safety_dto_retention_policy_retention_policy.dart';
import 'source_content_safety_dto_status_status.dart';

part 'source_content_safety_dto.g.dart';

@JsonSerializable()
class SourceContentSafetyDto {
  const SourceContentSafetyDto({
    required this.categories,
    required this.rawPayloadRetained,
    required this.retentionPolicy,
    required this.status,
  });

  factory SourceContentSafetyDto.fromJson(Map<String, Object?> json) =>
      _$SourceContentSafetyDtoFromJson(json);

  final List<SourceContentSafetyDtoCategoriesCategories> categories;
  final bool rawPayloadRetained;
  final SourceContentSafetyDtoRetentionPolicyRetentionPolicy retentionPolicy;
  final SourceContentSafetyDtoStatusStatus status;

  Map<String, Object?> toJson() => _$SourceContentSafetyDtoToJson(this);
}
