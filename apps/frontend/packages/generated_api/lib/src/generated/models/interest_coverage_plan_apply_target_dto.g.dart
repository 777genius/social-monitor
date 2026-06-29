// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'interest_coverage_plan_apply_target_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

InterestCoveragePlanApplyTargetDto _$InterestCoveragePlanApplyTargetDtoFromJson(
  Map<String, dynamic> json,
) => InterestCoveragePlanApplyTargetDto(
  method: InterestCoveragePlanApplyTargetDtoMethodMethod.fromJson(
    json['method'] as String,
  ),
  path: json['path'] as String,
  requiredScope:
      InterestCoveragePlanApplyTargetDtoRequiredScopeRequiredScope.fromJson(
        json['requiredScope'] as String,
      ),
);

Map<String, dynamic> _$InterestCoveragePlanApplyTargetDtoToJson(
  InterestCoveragePlanApplyTargetDto instance,
) => <String, dynamic>{
  'method': instance.method,
  'path': instance.path,
  'requiredScope': instance.requiredScope,
};
