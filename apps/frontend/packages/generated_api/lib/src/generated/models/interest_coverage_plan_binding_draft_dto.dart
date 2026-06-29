// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'interest_coverage_plan_binding_draft_dto.g.dart';

@JsonSerializable()
class InterestCoveragePlanBindingDraftDto {
  const InterestCoveragePlanBindingDraftDto({
    required this.config,
    required this.providerKey,
  });

  factory InterestCoveragePlanBindingDraftDto.fromJson(
    Map<String, Object?> json,
  ) => _$InterestCoveragePlanBindingDraftDtoFromJson(json);

  final dynamic config;
  final String providerKey;

  Map<String, Object?> toJson() =>
      _$InterestCoveragePlanBindingDraftDtoToJson(this);
}
