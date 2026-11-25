// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'plan_interest_coverage_request_dto.g.dart';

@JsonSerializable()
class PlanInterestCoverageRequestDto {
  const PlanInterestCoverageRequestDto({
    this.description,
    this.excludeProviders,
    this.includeProviders,
    this.keywords,
    this.rssFeedUrls,
    this.sourcePackKey,
    this.subreddits,
  });

  factory PlanInterestCoverageRequestDto.fromJson(Map<String, Object?> json) =>
      _$PlanInterestCoverageRequestDtoFromJson(json);

  final String? description;
  final List<String>? excludeProviders;
  final List<String>? includeProviders;
  final List<String>? keywords;
  final List<String>? rssFeedUrls;
  final String? sourcePackKey;
  final List<String>? subreddits;

  Map<String, Object?> toJson() => _$PlanInterestCoverageRequestDtoToJson(this);
}
