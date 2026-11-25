// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'interest_coverage_plan_skipped_provider_dto.g.dart';

@JsonSerializable()
class InterestCoveragePlanSkippedProviderDto {
  const InterestCoveragePlanSkippedProviderDto({
    required this.providerKey,
    required this.reason,
  });

  factory InterestCoveragePlanSkippedProviderDto.fromJson(
    Map<String, Object?> json,
  ) => _$InterestCoveragePlanSkippedProviderDtoFromJson(json);

  final String providerKey;
  final String reason;

  Map<String, Object?> toJson() =>
      _$InterestCoveragePlanSkippedProviderDtoToJson(this);
}
