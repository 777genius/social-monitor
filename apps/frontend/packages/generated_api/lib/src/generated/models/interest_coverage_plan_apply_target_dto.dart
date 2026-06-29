// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'interest_coverage_plan_apply_target_dto_method_method.dart';
import 'interest_coverage_plan_apply_target_dto_required_scope_required_scope.dart';

part 'interest_coverage_plan_apply_target_dto.g.dart';

@JsonSerializable()
class InterestCoveragePlanApplyTargetDto {
  const InterestCoveragePlanApplyTargetDto({
    required this.method,
    required this.path,
    required this.requiredScope,
  });

  factory InterestCoveragePlanApplyTargetDto.fromJson(
    Map<String, Object?> json,
  ) => _$InterestCoveragePlanApplyTargetDtoFromJson(json);

  final InterestCoveragePlanApplyTargetDtoMethodMethod method;
  final String path;
  final InterestCoveragePlanApplyTargetDtoRequiredScopeRequiredScope
  requiredScope;

  Map<String, Object?> toJson() =>
      _$InterestCoveragePlanApplyTargetDtoToJson(this);
}
